import { existsSync } from 'node:fs'
import { readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { getServices } from '$shared/services'
import { DEV_FOLDER } from '../config'
import { createMutex } from '../mutex'
import type { Holder } from './types'

/**
 * `~/dev/.atlas-hostnames.json` — every dev hostname atlas pushed to the NAS, keyed by slug.
 * Projects and services share the one slug namespace.
 */
export const REGISTRY_FILE = join(DEV_FOLDER, '.atlas-hostnames.json')
const ROOT_DOMAIN = 'jurrejan.com'
const SUBDOMAIN_LABEL = 'atlas'

export interface HostnameEntry {
  /** Absent on a service (`shared/services.json`) — it has a port, not a folder. */
  path?: string
  service?: true
  port: number
  /** LAN IP the route was pushed with — a DHCP change re-pushes on the next `ensureRoute`. */
  ip?: string
  /** False: the pushed block has no `atlas.remote` half (turned off, or no auth hash to gate it). */
  remote?: boolean
  /** A service's own short LAN name, served alongside `<slug>.atlas.local` (see `ServiceDef.host`). */
  host?: string
  /** `.atlas` `devPublic` override — remote reachable with no password. Tracked so a flag
   *  flip with no port change still triggers a re-push. */
  devPublic?: boolean
  /** Template revision of a service block; a bump re-pushes every service file once. */
  rev?: number
  registeredAt: string
  nasSynced?: boolean
  /** A release whose NAS removal failed: the file may still be served, so the row stays. */
  release?: true
}

export type Registry = Record<string, HostnameEntry>

// Registry read-modify-write isn't atomic, so two concurrent writers could drop one entry
// entirely. Serializing them is cheap — registrations are rare, human-triggered events.
export const withRegistryLock = createMutex()

/**
 * A path the way the scanner writes it, under the `~/dev` realpath. A row written through the
 * `~/Documents/development` symlink otherwise misses every exact-string join (release by path,
 * rename cleanup, the project row's chip). A path outside the tree, or gone, stays as it is.
 */
export async function normalizePath(path: string): Promise<string> {
  if (path.startsWith(`${DEV_FOLDER}/`)) return path
  const real = await realpath(path).catch(() => path)
  return real.startsWith(`${DEV_FOLDER}/`) ? real : path
}

/**
 * The file as written, paths untouched — the doctor's view of stale ones. Null-prototype, so a
 * slug lookup never lands on an `Object.prototype` member (`constructor` is a valid DNS label).
 */
export async function readRawRegistry(): Promise<Registry> {
  try {
    return Object.assign(Object.create(null), JSON.parse(await readFile(REGISTRY_FILE, 'utf-8')))
  } catch {
    return Object.create(null)
  }
}

async function normalize(registry: Registry): Promise<Registry> {
  for (const entry of Object.values(registry)) {
    if (entry.path) entry.path = await normalizePath(entry.path)
  }
  return registry
}

/** Every slug routed to the project at `path` (one, unless an old route was left behind). */
export const slugsAt = (registry: Registry, path: string): string[] =>
  Object.keys(registry).filter((s) => registry[s].path === path)

export async function readRegistry(): Promise<Registry> {
  return normalize(await readRawRegistry())
}

/** Temp file + rename: a torn write would lose every route at once. */
export async function writeRegistry(registry: Registry): Promise<void> {
  const tmp = `${REGISTRY_FILE}.${process.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(await normalize(registry), null, 2)}\n`)
  await rename(tmp, REGISTRY_FILE)
}

/**
 * The bcrypt hash behind a remote half's password. A service (the console carries shell-exec
 * routes) never shares the dev-preview password, which is handed to whoever views a preview.
 */
export const authHashFor = (service?: boolean): string | undefined =>
  (service ? process.env.CADDY_SERVICE_AUTH_HASH : process.env.CADDY_DEV_AUTH_HASH) || undefined

export const hasAuthHash = (service?: boolean): boolean => Boolean(authHashFor(service))

/** The URLs a slug is served on. `remote` is null when no remote block is (or can be) served. */
export function hostnamesFor(
  slug: string,
  entry?: Pick<HostnameEntry, 'host' | 'remote' | 'service'>,
): { local: string; remote: string | null } {
  return {
    local: `https://${entry?.host ?? `${slug}.${SUBDOMAIN_LABEL}.local.${ROOT_DOMAIN}`}`,
    remote:
      entry?.remote === false || !hasAuthHash(entry?.service)
        ? null
        : `https://${slug}.${SUBDOMAIN_LABEL}.remote.${ROOT_DOMAIN}`,
  }
}

export function serviceName(slug: string): string | undefined {
  return getServices().find((s) => s.slug === slug)?.name
}

/**
 * Who holds `slug` against a writer at `path` (undefined for a service writer), or null when it
 * is free for them. A project row whose folder is gone holds nothing: a folder moved outside
 * atlas must be able to take its own hostname back.
 */
export function rowHolder(
  slug: string,
  entry: HostnameEntry | undefined,
  writer: { path?: string; service?: true },
): Holder | null {
  const svc = serviceName(slug)
  if (writer.service) {
    if (!entry || entry.service) return null
    return { kind: 'project', name: basename(entry.path ?? slug), path: entry.path }
  }
  if (svc || entry?.service) return { kind: 'service', name: svc ?? slug }
  if (!entry?.path || entry.path === writer.path || !existsSync(entry.path)) return null
  return { kind: 'project', name: basename(entry.path), path: entry.path }
}

export function describeHolder(slug: string, holder: Holder): string {
  return `slug "${slug}" is taken by ${holder.kind} ${holder.name}${holder.path ? ` (${holder.path})` : ''}`
}
