import { Database } from 'bun:sqlite'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { json } from '@sveltejs/kit'
import { resolveInCatalog } from '$lib/claude-tree'
import { DEV_FOLDER } from '$lib/config'
import type { RequestHandler } from './$types'

const execFileAsync = promisify(execFile)

type EventRow = {
  at_ms: number
  kind: string
  op_id: string
  operation: string
  actor: string
  bead: string
  scopes: string
  summary: string
  expires_ms: number | null
  outcome: string
  detail: string
}

type ParsedEvent = Omit<EventRow, 'scopes' | 'detail'> & {
  scopes: string[]
  detail: Record<string, unknown>
}

type CoordinationRow = {
  session_id: string
  actor: string
  parent_id: string | null
  started_at: number
  closed_at: number | null
  scope: string
  task_id: string | null
  generation: number
  expires_ms: number
  worktree: string | null
  title: string | null
}

const EMPTY = { events: [], activeIntents: 0, latestHandoff: null }
const SINCE_MS = 30 * 60 * 1000

function parseRow(row: EventRow): ParsedEvent {
  let scopes: string[] = []
  let detail: Record<string, unknown> = {}
  try {
    scopes = JSON.parse(row.scopes) as string[]
    detail = JSON.parse(row.detail) as Record<string, unknown>
  } catch {
    /* corrupt row — keep the raw-typed fields it does have */
  }
  return { ...row, scopes, detail }
}

// Keep in sync with atlas-cli src/agent-log/render.ts visibleRows.
function visibleRows(rows: EventRow[]): EventRow[] {
  const now = Date.now()
  const since = now - SINCE_MS
  const ended = new Set(rows.filter((row) => row.kind === 'end').map((row) => row.op_id))
  const latestHandoff = rows.findLast((row) => row.kind === 'handoff')
  return rows.filter((row) => {
    if (row.kind === 'intent') return !ended.has(row.op_id) && (row.expires_ms ?? 0) >= now
    if (row.kind === 'handoff') return row === latestHandoff || row.at_ms >= since
    return row.kind === 'end' ? row.at_ms >= since : (row.expires_ms ?? 0) >= now
  })
}

function workspaceMode(root: string): string {
  try {
    if (!existsSync(join(root, '.atlas'))) return 'off'
    const config = JSON.parse(readFileSync(join(root, '.atlas'), 'utf8')) as {
      'agent-log'?: { mode?: string }
    }
    return config['agent-log']?.mode ?? 'off'
  } catch {
    return 'off'
  }
}

// Read-only snapshot of the coordination state (sessions, leases, tasks) — the
// v2 model's live view for dashboards and pickers. Never writes; a missing or
// locked journal reads as an empty block, never an error.
function coordinationBlock(commonDir: string, root: string): Record<string, unknown> {
  let rows: CoordinationRow[]
  try {
    const db = new Database(join(commonDir, 'agent-log.sqlite'), { readonly: true })
    try {
rows = db
        .query(
          `SELECT s.id AS session_id, s.actor, s.parent_id, s.started_at, s.closed_at,
            l.scope, l.task_id, l.generation, l.expires_ms, l.worktree,
            t.id AS task_id, t.title
          FROM sessions s
          LEFT JOIN leases l ON l.session_id = s.id AND l.expires_ms > $now
          LEFT JOIN tasks t ON t.id = l.task_id AND t.session_id = s.id
          WHERE s.closed_at IS NULL
          ORDER BY s.started_at
          LIMIT 20`
        )
        .all({ $now: Date.now() }) as CoordinationRow[]
    } finally {
      db.close()
    }
  } catch {
    return {}
  }
  const sessions: Record<string, unknown>[] = []
  const leases: Record<string, unknown>[] = []
  const tasks = new Map<string, string>()
  for (const row of rows) {
    if (!row.scope) continue
    leases.push({
      scope: row.scope,
      sessionId: row.session_id,
      taskId: row.task_id,
      generation: row.generation,
      expiresMs: row.expires_ms,
      worktree: row.worktree ?? 'main',
    })
    if (row.task_id && row.title) tasks.set(row.task_id, row.title)
  }
  for (const row of rows) {
    sessions.push({
      sessionId: row.session_id,
      actor: row.actor,
      parentId: row.parent_id,
      startedAt: row.started_at,
      leases: leases.filter((lease) => lease.sessionId === row.session_id),
    })
  }
  return {
    schemaVersion: 3,
    mode: workspaceMode(root),
    sessions,
    leases,
    tasks: [...tasks].map(([taskId, title]) => ({ taskId, title })),
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const path = url.searchParams.get('path')
  if (!path) return json({ error: 'Missing path' }, { status: 400 })
  const safe = resolveInCatalog(path, DEV_FOLDER)
  if (!safe) return json({ error: 'path is outside the project catalog' }, { status: 403 })

  let commonDir: string
  try {
    const { stdout } = await execFileAsync('git', [
      '-C',
      safe,
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ])
    commonDir = stdout.trim()
  } catch {
    return json(EMPTY) // not a git repo — no journal to serve
  }

  let rows: EventRow[]
  try {
    const db = new Database(join(commonDir, 'agent-log.sqlite'), { readonly: true })
    try {
      rows = db.query('SELECT * FROM events ORDER BY seq').all() as EventRow[]
    } finally {
      db.close()
    }
  } catch {
    return json(EMPTY) // missing or locked db reads as an empty journal, never a 500
  }

  const events = visibleRows(rows).map(parseRow)
  const handoff = rows.filter((row) => row.kind === 'handoff').at(-1)
  return json({
    events,
    activeIntents: events.filter((event) => event.kind === 'intent').length,
    latestHandoff: handoff ? parseRow(handoff) : null,
    coordination: coordinationBlock(commonDir, safe),
  })
}
