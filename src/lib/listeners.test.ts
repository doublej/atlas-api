import { describe, expect, it } from 'vitest'
import { ownersByPort } from './listeners'

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
