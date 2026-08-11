import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { json } from '@sveltejs/kit'
import {
  appendHistory,
  buildTreeCached,
  clearTreeCache,
  extractPreview,
  popHistory,
  readHistory,
  readSafely,
  resolveInCatalog,
  searchTree,
  sha,
} from '$lib/claude-tree'
import { DEV_FOLDER } from '$lib/config'
import type { RequestHandler } from './$types'

// The catalog boundary: every path read/written must resolve inside this dir
// (or be the global ~/.claude/CLAUDE.md). Fixed — never overridable via query.
const BASE_DIR = DEV_FOLDER

const deny = () => json({ error: 'path is outside the project catalog' }, { status: 403 })

/** One-line snapshot summary for the history dropdown. */
function previewLine(text: string): string {
  const { h1, blurb } = extractPreview(text)
  return [h1, blurb].filter(Boolean).join(' — ') || '(empty)'
}

export const GET: RequestHandler = async ({ url }) => {
  const path = url.searchParams.get('path')
  const history = url.searchParams.get('history')
  const snapshot = url.searchParams.get('snapshot')
  const search = url.searchParams.get('search')

  if (path) {
    const safe = resolveInCatalog(path, BASE_DIR)
    if (!safe) return deny()
    try {
      const content = await readSafely(safe)
      return json({ content, sha: sha(content) })
    } catch {
      return json({ error: 'file not found' }, { status: 404 })
    }
  }

  if (history) {
    const safe = resolveInCatalog(history, BASE_DIR)
    if (!safe) return deny()
    const entries = await readHistory(safe)
    return json(entries.map((e) => ({ ts: e.ts, sha: e.sha, preview: previewLine(e.content) })))
  }

  if (snapshot) {
    const safe = resolveInCatalog(snapshot, BASE_DIR)
    if (!safe) return deny()
    const entries = await readHistory(safe)
    const entry = entries.at(Number(url.searchParams.get('n')))
    return entry
      ? json({ content: entry.content })
      : json({ error: 'no such snapshot' }, { status: 404 })
  }

  if (search) {
    const root = url.searchParams.get('root') || BASE_DIR
    const safe = resolveInCatalog(root, BASE_DIR)
    if (!safe) return deny()
    return json(await searchTree(safe, search, BASE_DIR))
  }

  // Default request: the graph for ?root (falls back to the whole catalog).
  // ?up=1 keeps only the chain towards the root — no descendant walk.
  const root = url.searchParams.get('root') || BASE_DIR
  const safe = resolveInCatalog(root, BASE_DIR)
  const ancestorsOnly = url.searchParams.get('up') === '1'
  return safe ? json(await buildTreeCached(safe, { ancestorsOnly })) : deny()
}

type SaveBody = { op: 'save'; path: string; content: string; expectedSha?: string; force?: boolean }
type RevertBody = { op: 'revert'; path: string }
// `path` is the source CLAUDE.md; its sibling AGENTS.md is the (created-if-missing) target.
type SyncBody = { op: 'sync'; path: string }

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as SaveBody | RevertBody | SyncBody
  const safe = resolveInCatalog(body.path, BASE_DIR)
  if (!safe) return deny()
  clearTreeCache() // every op below writes a context file — the memoized graphs are stale

  if (body.op === 'sync') {
    let claude: string
    try {
      claude = await readSafely(safe)
    } catch {
      return json({ error: 'CLAUDE.md not found' }, { status: 404 })
    }
    const agentsPath = resolveInCatalog(join(dirname(safe), 'AGENTS.md'), BASE_DIR)
    if (!agentsPath) return deny()
    let prior = ''
    try {
      prior = await readSafely(agentsPath)
    } catch {
      // new AGENTS.md — nothing to snapshot
    }
    await appendHistory(agentsPath, prior)
    await writeFile(agentsPath, claude, 'utf-8')
    return json({ ok: true, sha: sha(claude), path: agentsPath })
  }

  if (body.op === 'save') {
    let prior = ''
    try {
      prior = await readSafely(safe)
    } catch {
      // new file — no prior content to snapshot
    }
    const diskSha = sha(prior)
    if (body.expectedSha && body.expectedSha !== diskSha && !body.force) {
      return json({ error: 'disk changed', disk_sha: diskSha }, { status: 409 })
    }
    await appendHistory(safe, prior)
    await writeFile(safe, body.content, 'utf-8')
    return json({ ok: true, sha: sha(body.content) })
  }

  if (body.op === 'revert') {
    const entry = await popHistory(safe)
    if (!entry) return json({ error: 'no history' }, { status: 404 })
    await writeFile(safe, entry.content, 'utf-8')
    return json({ ok: true, sha: entry.sha })
  }

  return json({ error: 'unknown op' }, { status: 400 })
}
