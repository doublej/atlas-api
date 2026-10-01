import { describe, expect, it } from 'vitest'
import { Selection } from './selection.svelte'

const plain = { shiftKey: false, metaKey: false, ctrlKey: false }
const shift = { ...plain, shiftKey: true }
const cmd = { ...plain, metaKey: true }
const order = ['a', 'b', 'c', 'd', 'e']

describe('Selection', () => {
  it('plain click selects only that row, and clears it when it was the only one', () => {
    const s = new Selection()
    s.set(['a', 'b'], true)
    s.click('c', plain, order)
    expect(s.list).toEqual(['c'])
    s.click('c', plain, order)
    expect(s.size).toBe(0)
  })

  it('cmd/ctrl-click and toggle add or remove one row and keep the rest', () => {
    const s = new Selection()
    s.click('a', plain, order)
    s.click('c', cmd, order)
    s.click('d', { ...plain, ctrlKey: true }, order)
    expect(s.list).toEqual(['a', 'c', 'd'])
    s.toggle('a')
    expect(s.list).toEqual(['c', 'd'])
  })

  it('shift-click adds the range from the anchor, in either direction, and keeps the anchor', () => {
    const s = new Selection()
    s.click('b', plain, order)
    s.click('d', shift, order)
    expect(s.list).toEqual(['b', 'c', 'd'])
    s.click('a', shift, order)
    expect(new Set(s.list)).toEqual(new Set(['a', 'b', 'c', 'd']))
  })

  it('shift-click without an anchor in view acts as a plain click', () => {
    const s = new Selection()
    s.click('c', shift, order)
    expect(s.list).toEqual(['c'])
    s.click('e', shift, ['d', 'e'])
    expect(s.list).toEqual(['e'])
  })

  it('prune drops ids that are no longer rows; clear empties it', () => {
    const s = new Selection<number>()
    s.set([1, 2, 3], true)
    s.prune([2, 3, 4])
    expect(s.list).toEqual([2, 3])
    s.clear()
    expect(s.size).toBe(0)
  })
})
