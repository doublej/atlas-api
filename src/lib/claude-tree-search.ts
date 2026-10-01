// Tree-scope find: search the body of every context file the tree for `root` holds.

import { resolve } from 'node:path'
import { resolveInCatalog } from './claude-tree'
import { matchLines, type SearchHit } from './claude-tree-match'
import { findAncestors, findContextFiles, findRuleFiles, readSafely } from './claude-tree-walk'

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
