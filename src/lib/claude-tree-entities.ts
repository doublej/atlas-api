// Markdown entity detection for the CLAUDE.md editor. Every non-blank line is an
// addressable item; the richer enclosing units anchor on their opening line:
// a heading → the whole section, a lone <tag> → the whole tagged block, a list
// marker → the whole bullet, everything else → that single line. Each carries a
// line range so the editor can offer per-item agent actions. Pure + framework-free
// — imported client-side by CmEditor and server-side by the agent endpoint.

// 'file' is never produced by parseEntities — the editor synthesizes it for the
// whole-file action button (startLine 1 → last line).
export type EntityKind = 'section' | 'block' | 'bullet' | 'line' | 'file'

export interface Entity {
  id: string // stable within one parse — `${kind}:${anchorLine}`
  kind: EntityKind
  anchorLine: number // 1-based line the affordance sits on (the opening line)
  startLine: number // 1-based, inclusive (== anchorLine)
  endLine: number // 1-based, inclusive — last line owned by this entity
  level: number // heading depth (1–6); else the line's indentation in spaces
  title: string // short label for the action menu
  text: string // the entity's full source text (startLine..endLine)
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/
const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.+)/
const TAG_OPEN = /^<([A-Za-z][\w:-]*)(?:\s[^>]*)?>$/ // a line that is solely an opening tag
const TAG_CLOSE = /^<\/[A-Za-z][\w:-]*>$/ // a line that is solely a closing tag
const FENCE = /^\s*(```|~~~)/
const TITLE_MAX = 64

const leadingSpaces = (line: string): number => line.length - line.trimStart().length

const clip = (s: string): string => (s.length > TITLE_MAX ? s.slice(0, TITLE_MAX - 1) + '…' : s)

/** Per-line flag: true when the line sits inside a fenced code block (``` or ~~~). */
function fencedLines(lines: string[]): boolean[] {
  const flags = new Array<boolean>(lines.length).fill(false)
  let open = false
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      flags[i] = true // the fence line itself is part of the block
      open = !open
    } else {
      flags[i] = open
    }
  }
  return flags
}

/** First line index of the body (skips a leading `---` YAML frontmatter block). */
function bodyStart(lines: string[]): number {
  if (lines[0]?.trim() !== '---') return 0
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') return i + 1
  return 0 // unterminated — treat the whole file as body
}

/** Last line a section owns: up to (not including) the next heading of equal-or-higher rank. */
function sectionEnd(lines: string[], fenced: boolean[], start: number, level: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    if (fenced[i]) continue
    const m = HEADING.exec(lines[i])
    if (m && m[1].length <= level) return i // 0-based line before this heading
  }
  return lines.length
}

/** Last line a bullet owns: trailing wrapped/nested lines indented past the marker. */
function bulletEnd(lines: string[], fenced: boolean[], start: number, indent: number): number {
  let end = start
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue // tentative — trailing blanks stay excluded
    if (!fenced[i] && leadingSpaces(lines[i]) <= indent) break // a sibling/parent ends it
    end = i
  }
  return end
}

/** Last line a `<tag>` block owns: its depth-aware matching close, else null. */
function blockEnd(lines: string[], fenced: boolean[], start: number, tag: string): number | null {
  const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'g')
  const closeRe = new RegExp(`</${tag}>`, 'g')
  let depth = 0
  for (let i = start; i < lines.length; i++) {
    if (fenced[i]) continue
    depth += (lines[i].match(openRe) || []).length - (lines[i].match(closeRe) || []).length
    if (i > start && depth <= 0) return i
  }
  return null
}

function sliceText(lines: string[], startIdx: number, endIdx: number): string {
  return lines.slice(startIdx, endIdx + 1).join('\n')
}

/**
 * Classify one line into its entity: a heading owns its section, a lone `<tag>`
 * owns its block, a list marker owns its bullet, anything else is a single line.
 * Returns null for lines that belong to a block opened elsewhere (closing tags).
 */
function lineEntity(lines: string[], fenced: boolean[], i: number): Entity | null {
  const raw = lines[i]
  const h = HEADING.exec(raw)
  if (h)
    return makeEntity(
      'section',
      i,
      sectionEnd(lines, fenced, i, h[1].length) - 1,
      h[1].length,
      h[2].trim(),
      lines,
    )
  const trimmed = raw.trim()
  const open = TAG_OPEN.exec(trimmed)
  if (open) {
    const end = blockEnd(lines, fenced, i, open[1])
    if (end !== null) return makeEntity('block', i, end, leadingSpaces(raw), `<${open[1]}>`, lines)
  }
  if (TAG_CLOSE.test(trimmed)) return null // owned by its block's opening affordance
  const b = BULLET.exec(raw)
  if (b)
    return makeEntity(
      'bullet',
      i,
      bulletEnd(lines, fenced, i, b[1].length),
      b[1].length,
      b[2].trim(),
      lines,
    )
  return makeEntity('line', i, i, leadingSpaces(raw), trimmed, lines)
}

/** Detect every non-blank line as an addressable entity, in document order. */
export function parseEntities(text: string): Entity[] {
  const lines = text.split('\n')
  const fenced = fencedLines(lines)
  const start = bodyStart(lines)
  const out: Entity[] = []
  for (let i = start; i < lines.length; i++) {
    if (fenced[i] || lines[i].trim() === '') continue
    const entity = lineEntity(lines, fenced, i)
    if (entity) out.push(entity)
  }
  return out
}

function makeEntity(
  kind: EntityKind,
  startIdx: number,
  endIdx: number,
  level: number,
  rawTitle: string,
  lines: string[],
): Entity {
  const anchor = startIdx + 1
  return {
    id: `${kind}:${anchor}`,
    kind,
    anchorLine: anchor,
    startLine: anchor,
    endLine: endIdx + 1,
    level,
    title: clip(rawTitle),
    text: sliceText(lines, startIdx, endIdx),
  }
}

/** Splice a replacement into `text` over the 1-based inclusive line range, trimming trailing blanks. */
export function replaceLines(
  text: string,
  startLine: number,
  endLine: number,
  replacement: string,
): string {
  const lines = text.split('\n')
  const before = lines.slice(0, startLine - 1)
  const after = lines.slice(endLine)
  const repl = replacement.replace(/\s+$/, '').split('\n')
  return [...before, ...repl, ...after].join('\n')
}
