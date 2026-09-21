import { describe, expect, it } from 'vitest'
import { ownersByPort, projectFor } from './listeners'
import type { Project } from './scanner'

describe('ownersByPort', () => {
  it('keeps one entry per port and gives a shared port to the other process, not atlas', () => {
    const sockets = [
      { port: 47823, pid: 10, address: '192.168.1.2', command: 'bun' },
      { port: 47891, pid: 10, address: '127.0.0.1', command: 'bun' },
      { port: 47823, pid: 20, address: '127.0.0.1', command: 'node' },
    ]
    expect(ownersByPort(sockets, 10)).toEqual([
      { port: 47823, pid: 20, command: 'node' },
      { port: 47891, pid: 10, command: 'bun' },
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
