// Pure text parsing for the CLAUDE.md tree: a file's preview (H1, blurb, sections,
// frontmatter globs) and its outbound references. No filesystem — buildTree resolves paths.

import type { Preview, Reference, RefKind } from './claude-tree'

/**
 * Rough token estimate — an indicator, not a precise count.
 * ~2.5 chars/token, calibrated against Claude Code's /context figures for
 * markdown-heavy CLAUDE.md files (paths, punctuation and tags tokenize densely;
 * the classic 4 chars/token prose rule ran ~1.6x low).
 */
export const estimateTokens = (text: string): number => Math.round(text.length / 2.5)

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
