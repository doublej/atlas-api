import { describe, expect, it } from 'vitest'
import { sortRows } from './table-sort.svelte'

describe('sortRows', () => {
  const rows = [{ v: 'b2' }, { v: '' }, { v: 'b10' }, { v: null }, { v: 'a' }]
  it('sorts text naturally and keeps blanks last both ways', () => {
    expect(sortRows(rows, (r) => r.v, false).map((r) => r.v)).toEqual(['a', 'b2', 'b10', '', null])
    expect(sortRows(rows, (r) => r.v, true).map((r) => r.v)).toEqual(['b10', 'b2', 'a', '', null])
  })
  it('sorts numbers by value and leaves the input alone', () => {
    const nums = [{ v: 10 }, { v: 9 }, { v: undefined }, { v: 100 }]
    expect(sortRows(nums, (r) => r.v, true).map((r) => r.v)).toEqual([100, 10, 9, undefined])
    expect(nums[0].v).toBe(10)
  })
})
