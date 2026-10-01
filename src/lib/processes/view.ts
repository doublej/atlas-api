/**
 * What `GET /api/processes` and the /processes page show of a snapshot: the row filters and
 * the sparkline history, one sample per row per fresh snapshot.
 */
import { getPrimaryHost } from '$shared/hosts'
import type { Snapshot } from './snapshot'
import {
  type AppRow,
  PROCESS_KINDS,
  type ProcessKind,
  type ProcessSnapshot,
  type RowHistory,
} from './types'

/** Five minutes at the pages' 5s poll. */
const HISTORY_SAMPLES = 60

const history = new Map<string, RowHistory>()

/** One sample per row per fresh snapshot; rows that ended take their history with them. */
export function record(rows: AppRow[]): void {
  const live = new Set(rows.map((r) => r.id))
  for (const id of history.keys()) if (!live.has(id)) history.delete(id)
  for (const { id, cpu, rss } of rows) {
    const h = history.get(id) ?? { cpu: [], rss: [] }
    h.cpu = [...h.cpu, cpu].slice(-HISTORY_SAMPLES)
    h.rss = [...h.rss, rss].slice(-HISTORY_SAMPLES)
    history.set(id, h)
  }
}

export interface ViewQuery {
  all: boolean
  /** Path, name or slug, any of them. */
  projects: string[]
  kinds: ProcessKind[]
  history: boolean
}

const matches = (p: AppRow['project'], q: string) =>
  p !== undefined && [p.path, p.name, p.slug].includes(q.replace(/(.)\/+$/, '$1'))

/** `GET /api/processes`: filters apply to rows, and `processes` holds exactly their members. */
export function viewOf(snap: Snapshot, q: ViewQuery): ProcessSnapshot {
  const rows = snap.rows.filter(
    (r) =>
      (q.all || r.dev) &&
      (!q.projects.length || q.projects.some((x) => matches(r.project, x))) &&
      (!q.kinds.length || q.kinds.includes(r.kind)),
  )
  const pids = new Set(rows.flatMap((r) => r.pids))
  const view: ProcessSnapshot = {
    generatedAt: snap.generatedAt,
    host: getPrimaryHost().id,
    self: snap.self,
    system: snap.system,
    rows,
    processes: snap.processes.filter((p) => pids.has(p.pid)),
  }
  if (q.history)
    view.history = Object.fromEntries(
      rows.flatMap((r) => {
        const h = history.get(r.id)
        return h ? [[r.id, h]] : []
      }),
    )
  return view
}

/** The query `GET /api/processes` and the /processes page share; an unknown kind is an error. */
export function parseViewQuery(
  params: URLSearchParams,
): ViewQuery | { error: string; kinds: readonly ProcessKind[] } {
  const list = (key: string) =>
    (params.get(key) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  const kinds = list('kind')
  const unknown = kinds.filter((k) => !PROCESS_KINDS.includes(k as ProcessKind))
  if (unknown.length) return { error: `unknown kind: ${unknown.join(', ')}`, kinds: PROCESS_KINDS }
  return {
    all: params.get('all') === '1',
    projects: list('project'),
    kinds: kinds as ProcessKind[],
    history: params.get('history') === '1',
  }
}
