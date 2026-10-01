// Pure logic for the CLAUDE.md tree viewer — the node types, parent
// wiring, the tree memo and the catalog boundary. Ported from the battle-tested
// .claude/scripts/claude_tree.py that shipped in the cookiecutter templates.
// No framework: consumed by src/routes/api/claude-tree/+server.ts.
// The walk, parsing, history sidecar and find live in the claude-tree-*.ts siblings.

import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { extractPreview, extractReferences } from './claude-tree-parse'
import {
  AGENTS,
  findAncestors,
  findContextFiles,
  findRuleFiles,
  folderAgentFiles,
  GLOBAL_CLAUDE,
  glossaryIn,
  isFile,
  isGlossary,
  PRIMARY,
  readSafely,
  resolveRefPath,
} from './claude-tree-walk'
import { tildify } from './format'

export { estimateTokens } from './claude-tree-parse'

export type NodeKind = 'root' | 'ancestor' | 'project' | 'descendant' | 'glossary' | 'rule'

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

const segCount = (p: string): number => p.split(sep).filter(Boolean).length

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
