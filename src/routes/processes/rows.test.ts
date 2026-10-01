import { describe, expect, it } from 'vitest'
import type { AppRow, ProcessInfo } from '$lib/processes/types'
import { groupByProject, matches } from './rows'

const row = (id: string, over: Partial<AppRow> = {}): AppRow =>
  ({
    id,
    pgid: 1,
    primary: 1,
    kind: 'node',
    name: id,
    dev: true,
    pids: [1],
    ports: [],
    cpu: 0,
    cpuTime: 0,
    rss: 1,
    uptime: 1,
    flags: [],
    ...over,
  }) as AppRow
const procs = new Map([
  [10, { pid: 10, command: 'node vite dev', cwd: '/Users/x/dev/web/a' } as ProcessInfo],
])

describe('matches', () => {
  const vite = row('vite', {
    pids: [10],
    ports: [4123],
    project: { name: 'a', path: '/Users/x/dev/web/a' },
  })
  it('a number is an exact pid or port', () => {
    expect(matches(vite, procs, '4123')).toBe(true)
    expect(matches(vite, procs, '10')).toBe(true)
    expect(matches(vite, procs, '412')).toBe(false)
  })
  it('text matches the name, the project and the members', () => {
    expect(matches(vite, procs, 'VITE')).toBe(true)
    expect(matches(vite, procs, 'web/a')).toBe(true)
    expect(matches(vite, procs, 'vite dev')).toBe(true)
    expect(matches(vite, procs, 'nope')).toBe(false)
  })
})

describe('groupByProject', () => {
  it('keeps arrival order and puts rows without a project last', () => {
    const p = (name: string) => ({ name, path: `/p/${name}` })
    const groups = groupByProject([
      row('x'),
      row('b1', { project: p('b'), rss: 2 }),
      row('a1', { project: p('a') }),
      row('b2', { project: p('b'), rss: 3 }),
    ])
    expect(groups.map((g) => [g.name, g.rows.map((r) => r.id), g.rss])).toEqual([
      ['b', ['b1', 'b2'], 5],
      ['a', ['a1'], 1],
      ['No project', ['x'], 1],
    ])
  })
})
