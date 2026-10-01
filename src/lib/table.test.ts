import { describe, expect, it } from 'vitest'
import { rowKeyAction } from './table'

const key = (
  k: string,
  mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {},
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
})

describe('rowKeyAction', () => {
  it('moves with j/k and the arrows, clamped to the rows', () => {
    expect(rowKeyAction(key('j'), 0, 3)).toEqual({ kind: 'move', index: 1 })
    expect(rowKeyAction(key('ArrowDown'), 2, 3)).toEqual({ kind: 'move', index: 2 })
    expect(rowKeyAction(key('k'), 2, 3)).toEqual({ kind: 'move', index: 1 })
    expect(rowKeyAction(key('ArrowUp'), 0, 3)).toEqual({ kind: 'move', index: 0 })
  })

  it('toggles with x or Space and expands with Enter', () => {
    expect(rowKeyAction(key('x'), 1, 3)).toEqual({ kind: 'toggle' })
    expect(rowKeyAction(key(' '), 1, 3)).toEqual({ kind: 'toggle' })
    expect(rowKeyAction(key('Enter'), 1, 3)).toEqual({ kind: 'expand' })
  })

  it('leaves modified keys and everything else to the browser', () => {
    expect(rowKeyAction(key('j', { metaKey: true }), 0, 3)).toBeNull()
    expect(rowKeyAction(key('x', { ctrlKey: true }), 0, 3)).toBeNull()
    expect(rowKeyAction(key('Tab'), 0, 3)).toBeNull()
  })
})
