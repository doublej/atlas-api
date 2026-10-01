import { networkInterfaces } from 'node:os'
import { getServices } from '$shared/services'
import { type NasResult, pushToNas, removeFromNas, renderSiteBlock } from './hostnames/nas'
import {
  authHashFor,
  describeHolder,
  type HostnameEntry,
  hasAuthHash,
  hostnamesFor,
  normalizePath,
  type Registry,
  readRegistry,
  rowHolder,
  slugsAt,
  withRegistryLock,
  writeRegistry,
} from './hostnames/registry'
import { forget, markFailed, markSyncing, trackedState, watchLive } from './hostnames/tracker'
import type { Holder, HostnameChipData, HostnameRow, HostnameState } from './hostnames/types'

/** Bump when the service block template changes: every service file is re-pushed once.
 *  2: services' remote half moved to its own password (`CADDY_SERVICE_AUTH_HASH`). */
const SERVICE_BLOCK_REV = 2

/** A slug write that would take another project's or service's hostname. Routes answer 409. */
export class SlugTakenError extends Error {
  constructor(
    readonly slug: string,
    readonly holder: Holder,
  ) {
    super(describeHolder(slug, holder))
  }
}

/** This machine's LAN IPv4 — resolved live so a DHCP-renewed address self-heals on the next run. */
export function lanIp(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  throw new Error('caddyDev: no LAN IPv4 address found')
}

/** The registry row plus what the live tracker knows, as one `HostnameState`. */
export function stateOf(slug: string, entry?: HostnameEntry): HostnameState {
  const base = {
    slug,
    ...hostnamesFor(slug, entry),
    nasSynced: !!entry?.nasSynced && !entry.release,
  }
  const tracked = trackedState(slug)
  if (!entry) return { ...base, state: tracked?.state === 'syncing' ? 'syncing' : 'none' }
  if (entry.release) {
    return { ...base, state: 'failed', error: 'release did not reach the NAS — retry' }
  }
  if (tracked) return { ...base, ...tracked }
  if (entry.nasSynced) return { ...base, state: 'live' }
  return { ...base, state: 'failed', error: 'NAS push failed — retry' }
}

interface RouteRequest {
  slug: string
  path?: string
  service?: true
  port: number
  devPublic?: boolean
  remote?: boolean
  host?: string
  /** Push even when the registry says the NAS already has this exact route. */
  force?: boolean
}

type Want = Required<Pick<HostnameEntry, 'port' | 'ip' | 'devPublic'>> &
  Pick<HostnameEntry, 'remote' | 'host' | 'rev'>

/** The NAS already serves exactly this route — nothing to push. */
function isCurrent(entry: HostnameEntry, want: Want): boolean {
  return (
    entry.port === want.port &&
    entry.ip === want.ip &&
    (entry.devPublic ?? false) === want.devPublic &&
    (entry.remote ?? true) === (want.remote ?? true) &&
    entry.host === want.host &&
    entry.rev === want.rev &&
    !!entry.nasSynced &&
    !entry.release
  )
}

/**
 * What the NAS should serve for `p`. No auth hash, no remote block: `remote: false` records
 * that, so a hash set later re-pushes.
 */
function wantFor(p: RouteRequest): Want {
  return {
    port: p.port,
    ip: lanIp(),
    devPublic: p.devPublic ?? false,
    remote: (p.remote ?? true) && hasAuthHash(p.service) ? undefined : false,
    host: p.host,
    rev: p.service ? SERVICE_BLOCK_REV : undefined,
  }
}

async function ensureUnlocked(p: RouteRequest): Promise<HostnameState> {
  const registry = await readRegistry()
  const existing = registry[p.slug]
  const holder = rowHolder(p.slug, existing, p)
  if (holder) throw new SlugTakenError(p.slug, holder)
  const want = wantFor(p)
  if (!p.force && existing && isCurrent(existing, want)) return stateOf(p.slug, existing)

  markSyncing(p.slug)
  const { remote, rev, ...block } = want
  const content = renderSiteBlock({
    ...block,
    slug: p.slug,
    remote: remote !== false,
    authHash: authHashFor(p.service),
    compress: !!p.service,
  })
  const pushed = await pushToNas(p.slug, content)
  const entry: HostnameEntry = {
    path: p.path, // undefined values drop out of the JSON
    service: p.service,
    ...want,
    registeredAt: existing?.registeredAt ?? new Date().toISOString(),
    nasSynced: pushed.ok,
  }
  registry[p.slug] = entry
  await writeRegistry(registry)

  if (pushed.ok) void watchLive(p.slug, new URL(hostnamesFor(p.slug, entry).local).host)
  else markFailed(p.slug, `NAS push failed: ${pushed.error}`)
  return stateOf(p.slug, entry)
}

async function removeUnlocked(slug: string): Promise<NasResult> {
  const registry = await readRegistry()
  const entry = registry[slug]
  if (!entry) return { ok: true }
  const removed = await removeFromNas(slug)
  // A failed removal keeps the row: the NAS may still serve the file, and only a row can be retried.
  if (removed.ok) delete registry[slug]
  else registry[slug] = { ...entry, nasSynced: false, release: true }
  await writeRegistry(registry)
  if (removed.ok) forget(slug)
  return removed
}

/**
 * Registers a dev hostname. Only pushes to the NAS (an SSH round-trip + a reload of a shared,
 * production Caddy instance) when something actually changed — a new project, a changed port
 * or LAN IP — or the last push never confirmed success; a repeat `atlas run` with an
 * already-synced port is a local no-op. An unreachable NAS fails soft: the state comes back
 * `failed` with `nasSynced: false`. A slug another project or service holds throws
 * {@link SlugTakenError}.
 */
export function ensureRoute(p: RouteRequest): Promise<HostnameState> {
  return withRegistryLock(() => ensureUnlocked(p))
}

/** Drops `slug`'s route from the NAS and the registry; a failed NAS removal keeps the row unsynced. */
export function removeRoute(slug: string): Promise<NasResult> {
  return withRegistryLock(() => removeUnlocked(slug))
}

/** Every route of the project at `path` (release, archive). */
export function removeRouteByPath(path: string): Promise<NasResult> {
  return withRegistryLock(async () => {
    const at = slugsAt(await readRegistry(), await normalizePath(path))
    for (const slug of at) {
      const removed = await removeUnlocked(slug)
      if (!removed.ok) return removed
    }
    return { ok: true }
  })
}

/** A folder move that keeps its slug: the row follows the folder and nothing is pushed. */
async function repath(slug: string, path: string): Promise<void> {
  const registry = await readRegistry()
  if (registry[slug].path === path) return
  registry[slug].path = path
  await writeRegistry(registry)
}

/** `slug`'s row when it is the live route of the project at `path` (no release pending). */
const liveRowAt = (rows: Registry, slug: string, path: string): HostnameEntry | undefined =>
  rows[slug]?.path === path && !rows[slug].release ? rows[slug] : undefined

/**
 * Carries the project at `path` from hostname `from` to `to`: the new route first, and the old
 * one goes only once the new one landed. `from === to` is a folder move that keeps its slug.
 */
export function moveRoute(
  path: string,
  from: string,
  to: string,
  change: { port?: number; devPublic?: boolean } = {},
): Promise<HostnameState> {
  return withRegistryLock(async () => {
    const rows = await readRegistry()
    const old = rows[from]
    if (!old) throw new Error(`no route "${from}" to move`)
    if (from === to) await repath(from, path)
    // A live row the project already has under `to` (a run after a hand-edited slug) is where its
    // server is: the stale `from` row's port would re-point that hostname at nothing.
    const base = liveRowAt(rows, to, path) ?? old
    const port = change.port ?? base.port
    const devPublic = change.devPublic ?? base.devPublic
    const state = await ensureUnlocked({ slug: to, path, port, devPublic })
    return from === to || !state.nasSynced ? state : dropOld(from, state)
  })
}

/** The old route of a move goes once the new one landed; a failed removal shows on the new state. */
async function dropOld(from: string, state: HostnameState): Promise<HostnameState> {
  const removed = await removeUnlocked(from)
  return removed.ok ? state : { ...state, error: `old hostname ${from} kept: ${removed.error}` }
}

/** Push a row again (or finish its release) — the retry behind a `failed` pill and the doctor. */
export function retryRoute(slug: string): Promise<HostnameState> {
  return withRegistryLock(async () => {
    const entry = (await readRegistry())[slug]
    if (!entry) return stateOf(slug)
    if (entry.release) {
      await removeUnlocked(slug)
      return stateOf(slug, (await readRegistry())[slug])
    }
    const svc = getServices().find((s) => s.slug === slug)
    return ensureUnlocked({
      slug,
      path: entry.path,
      service: entry.service,
      port: entry.port,
      devPublic: entry.devPublic,
      remote: entry.service ? (svc?.remote ?? false) : true,
      host: entry.service ? svc?.host : undefined,
      force: true,
    })
  })
}

/** Rewrite the registry as read: paths come back normalised to the ~/dev realpath. */
export function rewriteRegistry(): Promise<void> {
  return withRegistryLock(async () => writeRegistry(await readRegistry()))
}

export async function hostnameState(slug: string): Promise<HostnameState> {
  return stateOf(slug, (await readRegistry())[slug])
}

/**
 * The hostnames the NAS serves — what a link may point at. `all` adds the rows whose push failed
 * and the releases that never reached the NAS, for the views that offer a retry.
 */
export async function listHostnames({ all = false } = {}): Promise<HostnameRow[]> {
  const registry = await readRegistry()
  const rows = Object.entries(registry).map(([slug, entry]) => ({
    ...stateOf(slug, entry),
    path: entry.path,
    service: entry.service,
  }))
  return all ? rows : rows.filter((r) => r.nasSynced)
}

/** Project rows keyed by path, for the "/" page's chips. */
export async function hostnamesByPath(): Promise<Record<string, HostnameChipData>> {
  const rows = await listHostnames({ all: true })
  return Object.fromEntries(
    rows
      .filter((r) => r.path)
      .map((r) => [r.path as string, { slug: r.slug, local: r.local, state: r.state }]),
  )
}
