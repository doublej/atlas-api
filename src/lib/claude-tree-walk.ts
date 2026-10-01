// The filesystem half of the CLAUDE.md tree: which context files exist above and below a
// root, and reading one safely. buildTree wires the result into a graph.

import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path'
import type { AgentFiles } from './claude-tree'

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
const MAX_BYTES = 1_000_000 // per CLAUDE.md, hard safety cap

/** The global ancestor that applies to every project. Editable per project decision. */
export const GLOBAL_CLAUDE = join(homedir(), '.claude', 'CLAUDE.md')

/** The primary context file every node represents, unless it's a recognized glossary. */
export const PRIMARY = 'CLAUDE.md'
/** The cross-tool agent-doc sibling of a CLAUDE.md (Codex et al. read this name). */
export const AGENTS = 'AGENTS.md'
export const isGlossary = (name: string): boolean => name.toLowerCase() === 'glossary.md'
const isContextFile = (name: string): boolean =>
  name === PRIMARY || name === AGENTS || isGlossary(name)

export async function isFile(p: string): Promise<boolean> {
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
export async function glossaryIn(dir: string): Promise<string | null> {
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
export async function folderAgentFiles(primary: string): Promise<AgentFiles | undefined> {
  const base = basename(primary)
  if (base === PRIMARY) {
    const agents = resolve(join(dirname(primary), AGENTS))
    return { claude: primary, ...((await isFile(agents)) ? { agents } : {}) }
  }
  if (base === AGENTS) return { agents: primary }
  return undefined
}

/** Resolve a written path against `baseDir` (handling `~` and anchors); abs path if the file exists, else null. */
export async function resolveRefPath(rawPath: string, baseDir: string): Promise<string | null> {
  let p = rawPath.split('#')[0].trim()
  if (!p) return null
  if (p === '~' || p.startsWith('~/')) p = join(homedir(), p.slice(1))
  const abs = isAbsolute(p) ? resolve(p) : resolve(join(baseDir, p))
  return (await isFile(abs)) ? abs : null
}
