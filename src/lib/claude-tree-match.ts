// Line matching for find — pure, so the browser's File scope and the server's Tree
// scope window and cap their snippets the same way.

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
export function windowLine(line: string, col: number): { text: string; col: number } {
  if (line.length <= SNIPPET_MAX) return { text: line, col }
  const start = Math.max(0, col - Math.floor(SNIPPET_MAX / 2))
  const prefix = start > 0 ? '…' : ''
  return { text: prefix + line.slice(start, start + SNIPPET_MAX), col: col - start + prefix.length }
}

/** Case-insensitive substring matches per line (`q` already lower-cased), capped and windowed. */
export function matchLines(text: string, q: string): SearchMatch[] {
  const matches: SearchMatch[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length && matches.length < MAX_MATCHES_PER_FILE; i++) {
    const col = lines[i].toLowerCase().indexOf(q)
    if (col < 0) continue
    matches.push({ line: i + 1, ...windowLine(lines[i], col) })
  }
  return matches
}
