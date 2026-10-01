import { describe, expect, it } from 'vitest'
import { fileHit, findSummary, splitSnippet } from './find'

describe('fileHit', () => {
  it('searches the live buffer case-insensitively', () => {
    expect(fileHit('/r/CLAUDE.md', 'one\nTwo two\nthree', ' TWO ')).toEqual({
      path: '/r/CLAUDE.md',
      matches: [{ line: 2, text: 'Two two', col: 0 }],
    })
  })

  it('is null with no file, no query or no match', () => {
    expect(fileHit('', 'text', 'text')).toBeNull()
    expect(fileHit('/r/CLAUDE.md', 'text', '   ')).toBeNull()
    expect(fileHit('/r/CLAUDE.md', 'text', 'zzz')).toBeNull()
  })
})

describe('findSummary', () => {
  it('counts matches across files, singular and plural', () => {
    const m = { line: 1, text: 'x', col: 0 }
    expect(findSummary([{ path: 'a', matches: [m] }])).toBe('1 match · 1 file')
    expect(
      findSummary([
        { path: 'a', matches: [m, m] },
        { path: 'b', matches: [m] },
      ]),
    ).toBe('3 matches · 2 files')
    expect(findSummary([])).toBe('0 matches · 0 files')
  })
})

describe('splitSnippet', () => {
  it('splits around the match for the highlight', () => {
    expect(splitSnippet('see Atlas here', 4, 5)).toEqual(['see ', 'Atlas', ' here'])
    expect(splitSnippet('Atlas', 0, 5)).toEqual(['', 'Atlas', ''])
  })
})
