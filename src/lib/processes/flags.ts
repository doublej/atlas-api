/**
 * The flags on app rows — orphan, idle, heavy, duplicate — and their order. Thresholds are
 * named here and nowhere else.
 */
import type { Role } from './classify'
import type { Facts, Folded } from './groups'
import type { AppRow, TopEntry } from './types'

const DAY_S = 86_400
/** Lifetime CPU below this share of wall time, with no CPU right now, reads as idle. */
const IDLE_SHARE = 0.001
const HEAVY_RSS = 2 ** 30
const HEAVY_CPU = 90

const ORPHANABLE = new Set<Role>([
  'dev-server',
  'build',
  'program',
  'mcp',
  'language-server',
  'runner',
])
const IDLE_ROLES = new Set<Role>(['dev-server', 'program', 'build'])
/** Rows the summary strip names. */
const TOP = 5

/** Left behind: its parent exited, or its folder is gone. Never a launchd job or an atlas run. */
function orphanReason({ row, root, primary }: Folded, f: Facts): AppRow['orphanReason'] {
  if (!ORPHANABLE.has(primary.role) || row.launchd || row.atlasRun) return undefined
  if (root.ppid === 1) return 'parent-exited'
  const cwd = f.files.get(primary.pid)?.cwd
  return cwd && !f.exists(cwd) ? 'folder-gone' : undefined
}

function isIdle({ row, primary }: Folded): boolean {
  if (!IDLE_ROLES.has(primary.role) || row.launchd || row.uptime < DAY_S) return false
  return row.cpuTime / row.uptime < IDLE_SHARE && row.cpu < 1
}

export function flagRow(folded: Folded, f: Facts): void {
  const { row } = folded
  row.orphanReason = orphanReason(folded, f)
  if (row.orphanReason) row.flags.push('orphan')
  if (isIdle(folded)) row.flags.push('idle')
  const heavyBy = [
    ...(row.rss >= HEAVY_RSS ? (['rss'] as const) : []),
    ...(row.cpu >= HEAVY_CPU ? (['cpu'] as const) : []),
  ]
  if (heavyBy.length) {
    row.flags.push('heavy')
    row.heavyBy = heavyBy
  }
}

/** Two dev servers of the same name serving the same checkout. */
export function flagDuplicates(folded: Folded[]): void {
  const byKey = new Map<string, AppRow[]>()
  for (const { row, primary, checkout } of folded) {
    if (primary.role !== 'dev-server' || !checkout) continue
    const key = `${checkout}\0${row.name}`
    byKey.set(key, [...(byKey.get(key) ?? []), row])
  }
  for (const rows of byKey.values()) {
    if (rows.length < 2) continue
    for (const row of rows) {
      row.flags.unshift('duplicate')
      row.duplicateOf = rows.filter((r) => r !== row).map((r) => r.id)
    }
  }
}

/** Flagged first, then by project, then by RSS. */
export function compareRows(a: AppRow, b: AppRow): number {
  const flagged = Number(b.flags.length > 0) - Number(a.flags.length > 0)
  if (flagged) return flagged
  const [pa, pb] = [a.project?.name ?? '￿', b.project?.name ?? '￿']
  return pa === pb ? b.rss - a.rss : pa.localeCompare(pb)
}

/** The heaviest rows by `key`, over every row whatever the filter. */
export function topBy(rows: AppRow[], key: 'rss' | 'cpu'): TopEntry[] {
  return [...rows]
    .sort((a, b) => b[key] - a[key])
    .slice(0, TOP)
    .map(({ id, name, kind, rss, cpu }) => ({ id, name, kind, rss, cpu }))
}
