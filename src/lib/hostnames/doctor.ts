import { resolve4 } from 'node:dns/promises'
import { getServices } from '$shared/services'
import { lanIp, moveRoute, removeRoute, retryRoute, rewriteRegistry } from '../caddyDev'
import { DEV_FOLDER } from '../config'
import { errorMessage } from '../format'
import { listSockets } from '../ports'
import { currentSlug, scan } from '../scanner'
import { slugAt } from './claims'
import { findDrift, inRange } from './drift'
import { readNas, removeFromNas } from './nas'
import { hasAuthHash, readRawRegistry, readRegistry } from './registry'
import type { DriftItem } from './types'

const WAN_TIMEOUT_MS = 5000

/**
 * Is this network's public IP still on the NAS's `admin_ranges`, and does `*.jurrejan.com`
 * still resolve to it (nas.md §3)? Compared here and reduced to two booleans: the addresses
 * never leave this function.
 */
async function checkWan(adminRanges: string[]) {
  if (!adminRanges.length) return null
  const ip = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(WAN_TIMEOUT_MS) })
    .then((r) => r.text())
    .then((t) => t.trim())
    .catch(() => null)
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null
  const dns = await resolve4('doctor-probe.atlas.local.jurrejan.com').catch((): string[] => [])
  return { inAdminRanges: adminRanges.some((r) => inRange(ip, r)), dnsMatches: dns.includes(ip) }
}

/** Local project path → the slug it has now, for the project rows only (one `.atlas` read each). */
async function projectSlugs(paths: string[]): Promise<Map<string, string>> {
  const local = (await scan(DEV_FOLDER)).projects.filter((p) => p.isLocal)
  const out = new Map<string, string>()
  for (const path of paths) {
    const project = local.find((p) => p.path === path)
    if (project) out.set(path, await currentSlug(project))
  }
  return out
}

export async function diagnose(): Promise<DriftItem[]> {
  const [raw, rows, nas, sockets] = await Promise.all([
    readRawRegistry(),
    readRegistry(),
    readNas(),
    listSockets().catch(() => []),
  ])
  const paths = Object.values(rows).flatMap((e) => (e.path && !e.service ? [e.path] : []))
  const [projects, wan] = await Promise.all([projectSlugs(paths), checkWan(nas?.adminRanges ?? [])])
  return findDrift({
    raw,
    rows,
    projects,
    services: getServices(),
    listening: new Set(sockets.map((s) => s.port)),
    nas,
    ip: lanIp(),
    authHash: hasAuthHash(),
    wan,
    devFolder: DEV_FOLDER,
  })
}

/** Throws when the route call came back `failed` (a release that worked comes back `none`). */
const settled = async (state: Promise<{ state: string; error?: string }>) => {
  const s = await state
  if (s.state === 'failed') throw new Error(s.error ?? 'the NAS did not take it')
}

const removed = async (result: Promise<{ ok: boolean; error?: string }>) => {
  const r = await result
  if (!r.ok) throw new Error(r.error ?? 'NAS removal failed')
}

/** The fix behind one drift item's button. Throws with the reason when it didn't take. */
function applyFix(item: DriftItem): Promise<void> {
  const slug = item.slug ?? ''
  switch (item.kind) {
    case 'stale-path':
      return rewriteRegistry()
    case 'orphan-row':
      return removed(removeRoute(slug))
    case 'orphan-site-file':
      return removed(removeFromNas(slug))
    case 'slug-drift':
      return slugAt(item.path ?? '').then((to) => settled(moveRoute(item.path ?? '', slug, to)))
    case 'unsynced':
    case 'missing-site-file':
    case 'port-mismatch':
    case 'remote-missing':
      return settled(retryRoute(slug))
    default:
      return Promise.reject(new Error(`no fix for ${item.kind}`))
  }
}

/** Fix `ids` (every fixable item when omitted), one at a time, then diagnose again. */
export async function fixDrift(ids?: string[]) {
  const todo = (await diagnose()).filter((i) => i.fix && (!ids || ids.includes(i.id)))
  const results: { id: string; ok: boolean; error?: string }[] = []
  for (const item of todo) {
    results.push(
      await applyFix(item).then(
        () => ({ id: item.id, ok: true }),
        (e) => ({ id: item.id, ok: false, error: errorMessage(e) }),
      ),
    )
  }
  return { results, items: await diagnose() }
}
