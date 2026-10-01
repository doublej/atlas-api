// Pure logic for the CLAUDE.md tree viewer — filesystem walk, preview extraction,
// parent wiring, and the .history.jsonl sidecar. Ported from the battle-tested
// .claude/scripts/claude_tree.py that shipped in the cookiecutter templates.
// No framework: consumed by src/routes/api/claude-tree/+server.ts.

import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { tildify } from './format'

const SKIP = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'target',
  'dist',
  'build',
  '.next',
  '.svelte-kit',
  '.cache',
  '__pycache__',
  '.mypy_cache',
  '.ruff_cache',
  '.pytest_cache',
  '_diagnostics',
  '.gradle',
  'DerivedData',
  '.build',
  '.swiftpm',
  'worktrees',
  '.worktrees',
  '.worktree', // git worktrees are throwaway clones — not real context
])
const HISTORY_SUFFIX = '.history.jsonl'
const MAX_BYTES = 1_000_000 // per CLAUDE.md, hard safety cap

/** The global ancestor that applies to every project. Editable per project decision. */
export const GLOBAL_CLAUDE = join(homedir(), '.claude', 'CLAUDE.md')

export type NodeKind = 'root' | 'ancestor' | 'project' | 'descendant' | 'glossary' | 'rule'

/** The primary context file every node represents, unless it's a recognized glossary. */
const PRIMARY = 'CLAUDE.md'
/** The cross-tool agent-doc sibling of a CLAUDE.md (Codex et al. read this name). */
const AGENTS = 'AGENTS.md'
const isGlossary = (name: string): boolean => name.toLowerCase() === 'glossary.md'
const isContextFile = (name: string): boolean =>
  name === PRIMARY || name === AGENTS || isGlossary(name)
export interface Preview {
  h1: string
  blurb: string
  sections: string[]
  lines: number
  tokens: number // this file's own estimated token count
  globs?: string[] // a rule's `paths:` frontmatter globs (what files it attaches to)
}

/** How a reference was written in the source — drives the chip icon and resolution. */
export type RefKind = 'link' | 'import' | 'wikilink' | 'code-path'

/**
 * One outbound reference found in a node's body. `targetPath` is filled when the
 * reference resolves to an existing file; `targetId` when that file is also a node
 * in the tree (→ a reference edge is drawn). Unresolved refs stay clickable-but-inert.
 */
export interface Reference {
  kind: RefKind
  label: string // chip text — a link's label, else the path/slug as written
  rawPath: string // the path/slug exactly as authored (pre-resolution)
  line: number // 1-based line in the source file
  targetPath: string | null // resolved absolute path, when the file exists
  targetId: string | null // node id, when targetPath is itself a tree node
}
/** The agent-doc files co-located in a node's folder — the editor exposes one tab per present file. */
export interface AgentFiles {
  claude?: string
  agents?: string
}
export interface TreeNode {
  id: string
  path: string
  label: string
  kind: NodeKind
  parent: string | null
  preview: Preview
  tokensAccumulated: number // own tokens + every ancestor up the chain (loaded context budget)
  files?: AgentFiles // CLAUDE.md / AGENTS.md in this folder (absent for glossary nodes)
  references?: Reference[] // outbound references parsed from this file's body
}
export interface HistoryEntry {
  ts: string
  sha: string
  content: string
}

export const sha = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 12)

/**
 * Rough token estimate — an indicator, not a precise count.
 * ~2.5 chars/token, calibrated against Claude Code's /context figures for
 * markdown-heavy CLAUDE.md files (paths, punctuation and tags tokenize densely;
 * the classic 4 chars/token prose rule ran ~1.6x low).
 */
export const estimateTokens = (text: string): number => Math.round(text.length / 2.5)

/**
 * Card label: the containing folder (the filename is redundant — the card's kind says which file).
 * Inside the project it's project-relative (`app/services`, or the project folder name at the root);
 * the global root, outer ancestors, and any glossary above the root keep their `~/...` folder.
 */
function nodeLabel(root: string, path: string, kind: NodeKind): string {
  if (kind === 'rule') return 'rules/' + basename(path, '.md') // the rule's own name, not its folder
  const dir = dirname(path)
  if (kind === 'root' || kind === 'ancestor') return tildify(dir)
  const rel = relative(root, dir)
  if (rel === '') return basename(root)
  if (rel.startsWith('..')) return tildify(dir) // outside the root (e.g. an ancestor glossary)
  return rel
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile()
  } catch {
    return false
  }
}

/** Read a CLAUDE.md, capped at MAX_BYTES; throws if the file can't be read. */
export async function readSafely(path: string): Promise<string> {
  const buf = await readFile(path)
  if (buf.length > MAX_BYTES) {
    return buf.subarray(0, MAX_BYTES).toString('utf-8') + '\n\n... (truncated)'
  }
  return buf.toString('utf-8')
}

const segCount = (p: string): number => p.split(sep).filter(Boolean).length

/** Walk up from `root` collecting every CLAUDE.md, then the global `~/.claude/CLAUDE.md`. */
export async function findAncestors(root: string): Promise<string[]> {
  const results: string[] = []
  let cur = dirname(root)
  for (;;) {
    const candidate = join(cur, 'CLAUDE.md')
    if (await isFile(candidate)) results.push(resolve(candidate))
    const parent = dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  const global = resolve(GLOBAL_CLAUDE)
  if ((await isFile(global)) && !results.includes(global)) results.push(global)
  return results
}

/** Recursively collect context files (CLAUDE.md + GLOSSARY.md) under `root`, skipping noise dirs (SKIP). */
export async function findContextFiles(root: string): Promise<string[]> {
  const results: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) await walk(join(dir, e.name))
      } else if (e.isFile() && isContextFile(e.name)) {
        results.push(resolve(join(dir, e.name)))
      }
    }
  }
  await walk(root)
  return results.sort()
}

const RULES_DIR = join('.claude', 'rules')

/** Recursively collect `.claude/rules/*.md` files under `root` — the project's scoped context rules. */
export async function findRuleFiles(root: string): Promise<string[]> {
  const results: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const inRulesDir = dir.endsWith(sep + RULES_DIR) || dir.endsWith(RULES_DIR)
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) await walk(join(dir, e.name))
      } else if (inRulesDir && e.isFile() && e.name.endsWith('.md')) {
        results.push(resolve(join(dir, e.name)))
      }
    }
  }
  await walk(root)
  return results.sort()
}

/** The glossary file sitting in `dir`, if any (the special sibling of a CLAUDE.md). */
async function glossaryIn(dir: string): Promise<string | null> {
  for (const name of ['GLOSSARY.md', 'glossary.md', 'Glossary.md']) {
    const p = resolve(join(dir, name))
    if (await isFile(p)) return p
  }
  return null
}

/**
 * The agent-doc files in this node's folder, keyed for the editor's tabs.
 * A CLAUDE.md node also reports a sibling AGENTS.md; an AGENTS.md-primary node
 * reports only itself; a glossary node reports nothing (it's a single doc).
 */
async function folderAgentFiles(primary: string): Promise<AgentFiles | undefined> {
  const base = basename(primary)
  if (base === PRIMARY) {
    const agents = resolve(join(dirname(primary), AGENTS))
    return { claude: primary, ...((await isFile(agents)) ? { agents } : {}) }
  }
  if (base === AGENTS) return { agents: primary }
  return undefined
}

/**
 * Pull a leading YAML frontmatter block (if any): its `paths:` globs (the rule's
 * attach targets) and the line index where the body proper begins.
 */
function splitFrontmatter(lines: string[]): { globs: string[]; bodyStart: number } {
  if (lines[0]?.trim() !== '---') return { globs: [], bodyStart: 0 }
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i
      break
    }
  }
  if (end < 0) return { globs: [], bodyStart: 0 } // unterminated — treat as body
  const globs: string[] = []
  let inPaths = false
  for (let i = 1; i < end; i++) {
    const s = lines[i].trim()
    if (/^paths\s*:/.test(s)) {
      const inline = s.replace(/^paths\s*:/, '').trim()
      if (inline.startsWith('[')) {
        for (const m of inline.matchAll(/["']([^"']+)["']/g)) globs.push(m[1])
      } else {
        inPaths = true
      }
      continue
    }
    if (inPaths) {
      const m = s.match(/^-\s*["']?(.+?)["']?$/)
      if (m) globs.push(m[1])
      else if (s) inPaths = false // a sibling key ended the list
    }
  }
  return { globs, bodyStart: end + 1 }
}

/** H1 + first prose line + level-2 section headings + line count (frontmatter-aware). */
export function extractPreview(text: string): Preview {
  const lines = text.split('\n')
  const { globs, bodyStart } = splitFrontmatter(lines)
  const body = lines.slice(bodyStart)
  let h1 = ''
  let h1Idx = -1
  for (let i = 0; i < body.length; i++) {
    const s = body[i].trim()
    if (s.startsWith('# ') && !s.startsWith('## ')) {
      h1 = s.slice(2).trim()
      h1Idx = i
      break
    }
  }
  const sections = body
    .map((l) => l.trim())
    .filter((s) => s.startsWith('## ') && !s.startsWith('### '))
    .map((s) => s.slice(3).trim())
  let blurb = ''
  for (const ln of body.slice(h1Idx + 1)) {
    const s = ln.trim()
    if (!s || /^[#>\-*`|<]/.test(s)) continue
    blurb = s
    break
  }
  const preview: Preview = {
    h1,
    blurb,
    sections,
    lines: lines.length,
    tokens: estimateTokens(text),
  }
  if (globs.length) preview.globs = globs
  return preview
}

const isUrl = (s: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || s.startsWith('mailto:')
const looksLikePath = (s: string): boolean => s.includes('/') || /\.[A-Za-z0-9]{1,6}$/.test(s)

/**
 * Parse outbound references from a file body, line by line, in four "proper"
 * syntaxes: markdown links `[t](path)`, `@path` imports, `[[wikilinks]]`, and
 * backtick-wrapped file paths. Paths stay unresolved here — buildTree resolves
 * them against the file's own directory and the node set.
 */
export function extractReferences(text: string): Reference[] {
  const refs: Reference[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const ln = i + 1
    // markdown links / images: [label](path "title") — skip URLs and bare anchors
    for (const m of line.matchAll(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s[^)]*)?\)/g)) {
      const rawPath = m[2].trim()
      if (!rawPath || isUrl(rawPath) || rawPath.startsWith('#')) continue
      const label = (m[1] || rawPath).replace(/`/g, '').trim()
      refs.push({ kind: 'link', label, rawPath, line: ln, targetPath: null, targetId: null })
    }
    // @path imports (token start only → excludes emails)
    for (const m of line.matchAll(/(?:^|\s)@([^\s)]+)/g)) {
      const rawPath = m[1]
      if (isUrl(rawPath) || !looksLikePath(rawPath)) continue
      refs.push({
        kind: 'import',
        label: rawPath,
        rawPath,
        line: ln,
        targetPath: null,
        targetId: null,
      })
    }
    // [[wikilinks]] — slug, optionally aliased
    for (const m of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const inner = m[1].split('|')[0].trim()
      if (inner)
        refs.push({
          kind: 'wikilink',
          label: inner,
          rawPath: inner,
          line: ln,
          targetPath: null,
          targetId: null,
        })
    }
    // `path/to/file.ext` — inline code that is unmistakably a file path
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      const inner = m[1].trim()
      if (inner.includes('/') && /^[\w@./~-]+\.[A-Za-z0-9]{1,6}$/.test(inner)) {
        refs.push({
          kind: 'code-path',
          label: inner,
          rawPath: inner,
          line: ln,
          targetPath: null,
          targetId: null,
        })
      }
    }
  }
  // Dedup per (path, line): a backticked path inside a markdown link matches twice —
  // keep the richer syntax (link > import > wikilink > code-path).
  const rank: Record<RefKind, number> = { link: 0, import: 1, wikilink: 2, 'code-path': 3 }
  const best = new Map<string, Reference>()
  for (const r of refs) {
    const key = `${r.rawPath}\0${r.line}`
    const cur = best.get(key)
    if (!cur || rank[r.kind] < rank[cur.kind]) best.set(key, r)
  }
  return [...best.values()]
}

/** Resolve a written path against `baseDir` (handling `~` and anchors); abs path if the file exists, else null. */
async function resolveRefPath(rawPath: string, baseDir: string): Promise<string | null> {
  let p = rawPath.split('#')[0].trim()
  if (!p) return null
  if (p === '~' || p.startsWith('~/')) p = join(homedir(), p.slice(1))
  const abs = isAbsolute(p) ? resolve(p) : resolve(join(baseDir, p))
  return (await isFile(abs)) ? abs : null
}

export interface BuildOptions {
  /** Only the chain towards the root (ancestors + the project's own CLAUDE.md) — no descendant walk. */
  ancestorsOnly?: boolean
}

/**
 * Build the node list with parent wiring: ancestor chain (shallowest → deepest)
 * → project → descendants attached to their nearest CLAUDE.md-bearing ancestor dir.
 * A GLOSSARY.md is a 'glossary' node hanging off the CLAUDE.md in its own folder;
 * a .claude/rules/*.md is a 'rule' node hanging off the CLAUDE.md that owns the .claude dir.
 */
export async function buildTree(root: string, opts: BuildOptions = {}): Promise<TreeNode[]> {
  const rootResolved = resolve(root)
  const ancestors = await findAncestors(rootResolved)
  const contextFiles = opts.ancestorsOnly ? [] : await findContextFiles(rootResolved)
  const ruleFiles = opts.ancestorsOnly ? [] : await findRuleFiles(rootResolved)
  const claudeDescendants = contextFiles.filter((p) => basename(p) === PRIMARY)
  const agentsDescendants = contextFiles.filter((p) => basename(p) === AGENTS)
  const glossaryDescendants = contextFiles.filter((p) => isGlossary(basename(p)))
  const projectCmd = resolve(join(rootResolved, PRIMARY))
  const hasProject = await isFile(projectCmd)

  const nodes: TreeNode[] = []
  const idByPath = new Map<string, string>()
  const accById = new Map<string, number>()

  async function addNode(path: string, kind: NodeKind, parent: string | null): Promise<string> {
    const existing = idByPath.get(path)
    if (existing) return existing
    const id = `n${nodes.length}`
    let content = ''
    try {
      content = await readSafely(path)
    } catch {
      // race: file vanished between discovery and read — render an empty card
    }
    const preview = extractPreview(content)
    // Parents are always added before their children, so the parent's accumulated total is ready.
    const tokensAccumulated = (parent ? (accById.get(parent) ?? 0) : 0) + preview.tokens
    accById.set(id, tokensAccumulated)
    const parsed = extractReferences(content)
    for (const ref of parsed) {
      if (ref.kind !== 'wikilink') ref.targetPath = await resolveRefPath(ref.rawPath, dirname(path))
    }
    // Backtick paths are only kept when they resolve to a real file — an
    // illustrative `src/foo.ts` that points nowhere is noise, not a reference.
    const references = parsed.filter((r) => r.kind !== 'code-path' || r.targetPath !== null)
    nodes.push({
      id,
      path,
      label: nodeLabel(rootResolved, path, kind),
      kind,
      parent,
      preview,
      tokensAccumulated,
      files: await folderAgentFiles(path),
      ...(references.length ? { references } : {}),
    })
    idByPath.set(path, id)
    return id
  }

  // A glossary hangs off the given CLAUDE.md node, sharing its folder.
  async function addGlossaryFor(dir: string, claudeId: string | null): Promise<void> {
    const g = await glossaryIn(dir)
    if (g) await addNode(g, 'glossary', claudeId)
  }

  // Ancestor chain, shallowest first so the global/root context is the top node.
  // The global ~/.claude/CLAUDE.md is labelled 'root' rather than 'ancestor'.
  const globalResolved = resolve(GLOBAL_CLAUDE)
  const ancestorsSorted = [...new Set(ancestors)].sort((a, b) => segCount(a) - segCount(b))
  let prev: string | null = null
  for (const a of ancestorsSorted) {
    const id = await addNode(a, a === globalResolved ? 'root' : 'ancestor', prev)
    await addGlossaryFor(dirname(a), id) // an ancestor folder may carry its own glossary
    prev = id
  }

  // Project's own CLAUDE.md hangs off the deepest ancestor.
  const projectNode = hasProject ? await addNode(projectCmd, 'project', prev) : null

  // Each descendant CLAUDE.md attaches to the nearest ancestor dir that has its own CLAUDE.md.
  const parentForDir = new Map<string, string>()
  if (projectNode) parentForDir.set(rootResolved, projectNode)

  /** Walk up from `startDir` to the nearest folder with a known node, else `fallback`. */
  function nearestParentNode(startDir: string, fallback: string | null): string | null {
    let cur = startDir
    for (;;) {
      const known = parentForDir.get(cur)
      if (known) return known
      const up = dirname(cur)
      if (up === cur) return fallback
      cur = up
    }
  }

  for (const d of claudeDescendants) {
    if (d === projectCmd) continue
    const parentNode = nearestParentNode(dirname(dirname(d)), projectNode)
    const id = await addNode(d, 'descendant', parentNode)
    parentForDir.set(dirname(d), id)
  }

  // AGENTS.md attaches as a sibling tab to its folder's CLAUDE.md node when one exists;
  // otherwise it stands up its own node hanging off the nearest CLAUDE.md ancestor.
  for (const a of agentsDescendants) {
    const dir = dirname(a)
    if (idByPath.has(resolve(join(dir, PRIMARY)))) continue // surfaced via that node's `files.agents`
    const parentNode = nearestParentNode(dirname(dir), projectNode) ?? prev
    const kind: NodeKind = dir === rootResolved && !hasProject ? 'project' : 'descendant'
    await addNode(a, kind, parentNode)
  }

  // Each glossary attaches to its own folder's CLAUDE.md, else the nearest one above it,
  // falling back to the deepest ancestor so it never floats as a detached root.
  for (const g of glossaryDescendants) {
    let parentNode: string | null = parentForDir.get(dirname(g)) ?? projectNode
    if (!parentNode) {
      let cur = dirname(dirname(g))
      for (;;) {
        const known = parentForDir.get(cur)
        if (known) {
          parentNode = known
          break
        }
        const up = dirname(cur)
        if (up === cur) break
        cur = up
      }
    }
    await addNode(g, 'glossary', parentNode ?? prev)
  }

  // Each rule (.claude/rules/*.md) hangs off the CLAUDE.md that owns its .claude dir
  // (three levels up: file → rules/ → .claude/ → owning dir), else the nearest one above.
  for (const r of ruleFiles) {
    const ownerDir = dirname(dirname(dirname(r)))
    const parentNode = nearestParentNode(ownerDir, projectNode ?? prev)
    await addNode(r, 'rule', parentNode)
  }

  // Second pass: link each resolved reference to the node it points at (its path,
  // or one of that node's CLAUDE.md / AGENTS.md tabs) — these become reference edges.
  const idForPath = new Map<string, string>()
  for (const n of nodes) {
    idForPath.set(n.path, n.id)
    if (n.files?.claude) idForPath.set(n.files.claude, n.id)
    if (n.files?.agents) idForPath.set(n.files.agents, n.id)
  }
  for (const n of nodes) {
    if (!n.references) continue
    for (const ref of n.references) {
      if (ref.targetPath) ref.targetId = idForPath.get(ref.targetPath) ?? null
    }
  }

  return nodes
}

// The recursive walk + read of every CLAUDE.md is the expensive half of a tree request,
// and the graph only moves when a context file is written (POST clears the cache) or the
// TTL lapses — same stale-while-you-work bargain as the scanner's .atlas-cache.json.
const TREE_TTL_MS = 60_000
const treeCache = new Map<string, { at: number; nodes: TreeNode[] }>()

/** Drop every memoized tree — called after any write to a context file. */
export const clearTreeCache = (): void => treeCache.clear()

/** `buildTree` behind a 60s memo, keyed by resolved root + options. */
export async function buildTreeCached(root: string, opts: BuildOptions = {}): Promise<TreeNode[]> {
  const key = `${resolve(root)}|${opts.ancestorsOnly ? 'up' : 'full'}`
  const hit = treeCache.get(key)
  if (hit && Date.now() - hit.at < TREE_TTL_MS) return hit.nodes
  const nodes = await buildTree(root, opts)
  treeCache.set(key, { at: Date.now(), nodes })
  return nodes
}

const historyPathFor = (p: string): string => p + HISTORY_SUFFIX

const isoSeconds = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

const MAX_HISTORY_ENTRIES = 20

/** Append the prior file content to the sidecar before an overwrite (one JSON line),
 *  keeping only the newest MAX_HISTORY_ENTRIES snapshots. */
export async function appendHistory(file: string, priorContent: string): Promise<void> {
  const record: HistoryEntry = { ts: isoSeconds(), sha: sha(priorContent), content: priorContent }
  const entries = [...(await readHistory(file)), record].slice(-MAX_HISTORY_ENTRIES)
  await writeFile(
    historyPathFor(file),
    entries.map((e) => JSON.stringify(e) + '\n').join(''),
    'utf-8',
  )
}

export async function readHistory(file: string): Promise<HistoryEntry[]> {
  let raw: string
  try {
    raw = await readFile(historyPathFor(file), 'utf-8')
  } catch {
    return []
  }
  const entries: HistoryEntry[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      entries.push(JSON.parse(t) as HistoryEntry)
    } catch {
      // skip a corrupt line rather than fail the whole read
    }
  }
  return entries
}

/** Remove and return the most recent snapshot (LIFO) — backs the revert action. */
export async function popHistory(file: string): Promise<HistoryEntry | null> {
  const entries = await readHistory(file)
  const last = entries.pop()
  if (!last) return null
  await writeFile(
    historyPathFor(file),
    entries.map((e) => JSON.stringify(e) + '\n').join(''),
    'utf-8',
  )
  return last
}

/**
 * Resolve `candidate` and confirm it is inside the catalog `baseDir` (the scanner's
 * scan root) or is exactly the global `~/.claude/CLAUDE.md`. Returns the resolved
 * absolute path when allowed, or null when the path escapes the catalog (→ 403).
 */
export function resolveInCatalog(candidate: string, baseDir: string): string | null {
  // A non-absolute candidate would be resolved against the daemon's own cwd, which lives
  // *inside* the catalog — so `C:\dev\web\foo` (absolute on Fractal, relative here) would
  // resolve to `…/atlas-api/C:\dev\web\foo` and pass. Remote paths must fail closed.
  if (!isAbsolute(candidate)) return null
  const real = resolve(candidate)
  const base = resolve(baseDir)
  if (real === resolve(GLOBAL_CLAUDE)) return real
  if (real === base || real.startsWith(base + sep)) return real
  return null
}

export interface SearchMatch {
  line: number // 1-based line number
  text: string // the matching line (windowed for very long lines)
  col: number // match offset within `text`
}
export interface SearchHit {
  path: string
  matches: SearchMatch[]
}

const MAX_MATCHES_PER_FILE = 50
const SNIPPET_MAX = 200 // window long lines around the match

/** Trim a long line to a window around `col`, returning the windowed text and adjusted offset. */
function windowLine(line: string, col: number): { text: string; col: number } {
  if (line.length <= SNIPPET_MAX) return { text: line, col }
  const start = Math.max(0, col - Math.floor(SNIPPET_MAX / 2))
  const prefix = start > 0 ? '…' : ''
  return { text: prefix + line.slice(start, start + SNIPPET_MAX), col: col - start + prefix.length }
}

/** Case-insensitive substring matches per line (`q` already lower-cased), capped and windowed. */
function matchLines(text: string, q: string): SearchMatch[] {
  const matches: SearchMatch[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
    const col = lines[i].toLowerCase().indexOf(q)
    if (col < 0) continue
    matches.push({ line: i + 1, ...windowLine(lines[i], col) })
  }
  return matches
}

/** Read a file and collect its matches; null when it can't be read or has none. */
async function searchFile(path: string, q: string): Promise<SearchHit | null> {
  let text: string
  try {
    text = await readSafely(path)
  } catch {
    return null
  }
  const matches = matchLines(text, q)
  return matches.length ? { path, matches } : null
}

/** The tree's file set = ancestors + descendants, restricted to the read boundary. */
async function treeFiles(root: string, baseDir: string): Promise<string[]> {
  const r = resolve(root)
  const all = [
    ...new Set([
      ...(await findAncestors(r)),
      ...(await findContextFiles(r)),
      ...(await findRuleFiles(r)),
    ]),
  ]
  return all.filter((p) => resolveInCatalog(p, baseDir) !== null)
}

/** Search every tree file's body for `query` (case-insensitive substring), dropping empties. */
export async function searchTree(
  root: string,
  query: string,
  baseDir: string,
): Promise<SearchHit[]> {
  const q = query.toLowerCase()
  const files = await treeFiles(root, baseDir)
  const hits = await Promise.all(files.map((f) => searchFile(f, q)))
  return hits.filter((h): h is SearchHit => h !== null)
}
