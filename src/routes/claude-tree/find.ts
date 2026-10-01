// Find-panel helpers: File scope searches the live (possibly unsaved) editor content
// client-side with the same matcher the server's Tree scope uses.

import { matchLines, type SearchHit } from '$lib/claude-tree-match'

/** The open file's matches for `query`, or null when nothing is open, typed or found. */
export function fileHit(path: string, content: string, query: string): SearchHit | null {
  const q = query.trim().toLowerCase()
  if (!path || !q) return null
  const matches = matchLines(content, q)
  return matches.length ? { path, matches } : null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** `3 matches · 2 files` */
export function findSummary(hits: SearchHit[]): string {
  const n = hits.reduce((sum, h) => sum + h.matches.length, 0)
  return `${plural(n, 'match', 'matches')} · ${plural(hits.length, 'file', 'files')}`
}

/** A snippet split around its match, for the <mark>. */
export function splitSnippet(text: string, col: number, len: number): [string, string, string] {
  return [text.slice(0, col), text.slice(col, col + len), text.slice(col + len)]
}
