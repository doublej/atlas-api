/** The /processes page's search, filters and grouping. Pure. */
import type { AppRow, ProcessInfo } from '$lib/processes/types'
import type { SortValue } from '$lib/table-sort.svelte'

/** Sort values by column key; the table's columns and the page's row order both use these. */
export const SORTS: Record<string, (r: AppRow) => SortValue> = {
  kind: (r) => r.kind,
  name: (r) => r.name,
  project: (r) => r.project?.name,
  ports: (r) => r.ports[0],
  cpu: (r) => r.cpu,
  rss: (r) => r.rss,
  uptime: (r) => r.uptime,
}

/**
 * A number matches a pid or a port exactly (`/processes?q=4123` from the ports page); text
 * matches the name, tool, kind, project, session, or any member's command or folder.
 */
export function matches(row: AppRow, procs: Map<number, ProcessInfo>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (/^\d+$/.test(q)) return row.pids.includes(Number(q)) || row.ports.includes(Number(q))
  const members = row.pids.map((pid) => procs.get(pid))
  const text = [row.name, row.tool, row.kind, row.project?.name, row.project?.path, row.session]
  const fromMembers = members.flatMap((p) => [p?.command, p?.cwd])
  return [...text, ...fromMembers].some((s) => s?.toLowerCase().includes(q))
}

export interface Group {
  key: string
  name: string
  path?: string
  rows: AppRow[]
  rss: number
}

/** One group per project in the order rows arrive (flagged first), rows without one last. */
export function groupByProject(rows: AppRow[]): Group[] {
  const groups = new Map<string, Group>()
  for (const row of rows) {
    const key = row.project?.path ?? ''
    const group = groups.get(key) ?? {
      key,
      name: row.project?.name ?? 'No project',
      path: row.project?.path,
      rows: [],
      rss: 0,
    }
    group.rows.push(row)
    group.rss += row.rss
    groups.set(key, group)
  }
  const none = groups.get('')
  groups.delete('')
  return [...groups.values(), ...(none ? [none] : [])]
}

/** How many rows of each kind, for the filter chips. */
export function countKinds(rows: AppRow[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])
}
