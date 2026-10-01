import { describe, expect, it } from 'vitest'
import { matchLines, windowLine } from './claude-tree-match'

describe('matchLines', () => {
  it('finds case-insensitive matches with 1-based lines and the column', () => {
    expect(matchLines('# Title\nsee Atlas here\nnothing', 'atlas')).toEqual([
      { line: 2, text: 'see Atlas here', col: 4 },
    ])
  })

  it('returns nothing when no line matches', () => {
    expect(matchLines('a\nb', 'zzz')).toEqual([])
  })

  it('stops at 50 matches per file', () => {
    const text = Array.from({ length: 80 }, () => 'hit').join('\n')
    const matches = matchLines(text, 'hit')
    expect(matches).toHaveLength(50)
    expect(matches.at(-1)?.line).toBe(50)
  })
})

describe('windowLine', () => {
  it('keeps a short line whole', () => {
    expect(windowLine('short line', 6)).toEqual({ text: 'short line', col: 6 })
  })

  it('windows a long line around the match and shifts the column past the ellipsis', () => {
    const line = `${'x'.repeat(300)}needle${'y'.repeat(300)}`
    const { text, col } = windowLine(line, 300)
    expect(text.startsWith('…')).toBe(true)
    expect(text.length).toBe(201)
    expect(text.slice(col, col + 6)).toBe('needle')
  })

  it('adds no ellipsis when the window starts at the line start', () => {
    const line = `needle${'y'.repeat(400)}`
    const { text, col } = windowLine(line, 0)
    expect(text.startsWith('needle')).toBe(true)
    expect(col).toBe(0)
  })
})
