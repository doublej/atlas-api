import { tildify } from '../format'
import { type NasView, WILDCARD_FILE } from './nas'
import type { HostnameEntry, Registry } from './registry'
import { slugProblem } from './slug'
import type { DriftItem } from './types'

// Pure: every way the registry, the projects, the services and the NAS disagree. The doctor
// (`doctor.ts`) gathers the inputs and applies the fixes; this only compares.

export interface DriftInput {
  /** The registry file as written, paths untouched. */
  raw: Registry
  /** The same rows with paths normalised to the ~/dev realpath. */
  rows: Registry
  /** Local project path → the slug it has now (`.atlas` or folder). */
  projects: Map<string, string>
  /** Row paths whose folder is still on disk, catalogued or not. */
  folders: Set<string>
  services: { slug: string; port: number }[]
  /** Ports something listens on right now. */
  listening: Set<number>
  /** null: the NAS could not be read. */
  nas: NasView | null
  /** This Mac's LAN IP — where every NAS file should point. */
  ip: string
  authHash: boolean
  /** null: the public IP could not be read. Never carries the addresses themselves. */
  wan: { inAdminRanges: boolean; dnsMatches: boolean } | null
  devFolder: string
}

const item = (
  kind: string,
  key: string,
  detail: string,
  fix: string | null,
  extra: Pick<DriftItem, 'slug' | 'path'> = {},
): DriftItem => ({ id: `${kind}:${key}`, kind, ...extra, detail, fix: fix ? { label: fix } : null })

function syncDrift(slug: string, entry: HostnameEntry, input: DriftInput): DriftItem[] {
  const out: DriftItem[] = []
  const raw = input.raw[slug]?.path
  if (raw && !raw.startsWith(`${input.devFolder}/`)) {
    const detail = `path ${tildify(raw)} is not under ~/dev`
    out.push(item('stale-path', slug, detail, 'Rewrite path', { slug, path: entry.path }))
  }
  if (entry.release) {
    out.push(item('unsynced', slug, 'a release never reached the NAS', 'Retry release', { slug }))
  } else if (!entry.nasSynced) {
    out.push(item('unsynced', slug, 'the last push never reached the NAS', 'Retry push', { slug }))
  }
  return out
}

function serviceDrift(slug: string, input: DriftInput): DriftItem[] {
  const svc = input.services.find((s) => s.slug === slug)
  if (!svc) {
    return [
      item('orphan-row', slug, 'service no longer in shared/services.json', 'Release', { slug }),
    ]
  }
  if (input.listening.has(svc.port)) return []
  const detail = `nothing listens on :${svc.port} — start it, or drop it from shared/services.json`
  return [item('service-down', slug, detail, null, { slug })]
}

function projectDrift(slug: string, entry: HostnameEntry, input: DriftInput): DriftItem[] {
  const path = entry.path
  const now = path ? input.projects.get(path) : undefined
  if (now === undefined && path && input.folders.has(path)) {
    // Out of the catalog (ignore, force:false, depth) is not gone: never one click from release.
    const detail = `${tildify(path)} is still there but the scan skips it — release it by hand if meant`
    return [item('orphan-row', slug, detail, null, { slug, path })]
  }
  if (now === undefined) {
    const detail = `no project at ${tildify(path ?? '?')}`
    return [item('orphan-row', slug, detail, 'Release', { slug, path })]
  }
  if (now === slug) return []
  const detail = `the project's slug is now "${now}"`
  return [item('slug-drift', slug, detail, `Move to ${now}`, { slug, path })]
}

function rowDrift(slug: string, entry: HostnameEntry, input: DriftInput): DriftItem[] {
  const out = syncDrift(slug, entry, input)
  if (entry.release) return out // finishing the release settles everything else about it
  if (entry.service) return [...out, ...serviceDrift(slug, input)]
  return [...out, ...projectDrift(slug, entry, input)]
}

function siteDrift(
  slug: string,
  entry: HostnameEntry,
  nas: NasView,
  input: DriftInput,
): DriftItem[] {
  if (entry.release || !entry.nasSynced) return [] // already reported as unsynced
  const site = nas.sites.find((s) => s.file === `${slug}-atlas.caddy`)
  if (!site)
    return [
      item('missing-site-file', slug, `the NAS has no ${slug}-atlas.caddy`, 'Re-push', { slug }),
    ]
  const out: DriftItem[] = []
  const ports = site.upstreams.map((u) => Number(u.split(':').at(-1)))
  if (ports.some((p) => p !== entry.port)) {
    out.push(
      item(
        'port-mismatch',
        slug,
        `NAS file proxies to :${ports.join(', :')}, the row says :${entry.port}`,
        'Re-push',
        { slug },
      ),
    )
  } else if (site.upstreams.some((u) => u.split(':')[0] !== input.ip)) {
    out.push(
      item('port-mismatch', slug, "NAS file targets another LAN IP than this Mac's", 'Re-push', {
        slug,
      }),
    )
  }
  const remoteExpected = entry.remote !== false && input.authHash
  if (remoteExpected && !site.hosts.some((h) => h.includes('.atlas.remote.'))) {
    out.push(
      item(
        'remote-missing',
        slug,
        'remote expected, the NAS file has no atlas.remote block',
        'Re-push',
        { slug },
      ),
    )
  }
  return out
}

function nasDrift(nas: NasView, rows: Registry): DriftItem[] {
  const out: DriftItem[] = []
  if (!nas.sites.some((s) => s.file === WILDCARD_FILE)) {
    out.push(
      item(
        'wildcard-missing',
        WILDCARD_FILE,
        `sites/${WILDCARD_FILE} is gone — every new hostname costs two certificates again`,
        null,
      ),
    )
  }
  for (const { file } of nas.sites) {
    if (file === WILDCARD_FILE) continue
    const slug = file.match(/^(.+)-atlas\.caddy$/)?.[1]
    // A name no slug can have is not atlas's to delete, and must never reach `removeFromNas`.
    if (!slug || slugProblem(slug))
      out.push(item('orphan-site-file', file, 'legacy NAS file — ask JJ', null))
    else if (!rows[slug])
      out.push(
        item('orphan-site-file', file, `sites/${file} has no registry row`, 'Remove file', {
          slug,
        }),
      )
  }
  return out
}

function wanDrift(wan: NonNullable<DriftInput['wan']>): DriftItem[] {
  const out: DriftItem[] = []
  if (!wan.inAdminRanges) {
    out.push(
      item(
        'wan-drift',
        'admin-ranges',
        "this network's public IP differs from admin_ranges in snippets/common.caddy — .atlas.local answers 403 on the LAN",
        null,
      ),
    )
  }
  if (!wan.dnsMatches) {
    out.push(
      item(
        'wan-drift',
        'dns',
        "the *.jurrejan.com A record differs from this network's public IP",
        null,
      ),
    )
  }
  return out
}

export function findDrift(input: DriftInput): DriftItem[] {
  const out: DriftItem[] = []
  for (const [slug, entry] of Object.entries(input.rows)) {
    out.push(...rowDrift(slug, entry, input))
    if (input.nas) out.push(...siteDrift(slug, entry, input.nas, input))
  }
  if (input.nas) out.push(...nasDrift(input.nas, input.rows))
  else
    out.push(item('nas-unreachable', 'nas', 'ssh nas failed — the NAS side was not checked', null))
  if (input.wan) out.push(...wanDrift(input.wan))
  return out
}

/** Pure: is IPv4 `ip` inside `range` (`a.b.c.d` or `a.b.c.d/n`)? */
export function inRange(ip: string, range: string): boolean {
  const toInt = (v: string) => v.split('.').reduce((n, o) => n * 256 + Number(o), 0)
  const [base, bits = '32'] = range.split('/')
  const shift = 32 - Number(bits)
  return Math.floor(toInt(ip) / 2 ** shift) === Math.floor(toInt(base) / 2 ** shift)
}
