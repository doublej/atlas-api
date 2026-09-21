import { describe, expect, it } from 'vitest'
import { parseLsof, projectFor } from './listeners'
import type { Project } from './scanner'

describe('parseLsof', () => {
  it('keeps one entry per port and gives a shared port to the other process, not atlas', () => {
    const out = 'p10\ncatlas\nn192.168.1.2:47823\nn127.0.0.1:47891\np20\ncnode\nn127.0.0.1:47823\n'
    expect(parseLsof(out, 10)).toEqual([
      { port: 47823, pid: 20, command: 'node' },
      { port: 47891, pid: 10, command: 'atlas' },
    ])
  })
})

describe('projectFor', () => {
  const projects = [{ path: '/dev/a' }, { path: '/dev/a/app' }, { path: '/dev/ab' }] as Project[]

  it('picks the deepest project containing the cwd', () => {
    expect(projectFor('/dev/a/app/src', projects)?.path).toBe('/dev/a/app')
  })

  it('does not match a sibling that shares a prefix', () => {
    expect(projectFor('/dev/abc', projects)).toBeUndefined()
  })
})
