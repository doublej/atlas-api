import { describe, expect, it } from 'vitest'
import { renderSiteBlock } from './caddyDev'
import { listenersOn, routeMode } from './services'

describe('routeMode', () => {
  it('routes a wildcard bind directly', () => {
    expect(routeMode([{ port: 4180, lanReachable: true }])).toBe('direct')
  })

  it('bridges a loopback-only bind', () => {
    expect(routeMode([{ port: 47891, lanReachable: false }])).toBe('bridge')
  })

  it('is down with no listeners', () => {
    expect(routeMode([])).toBe('down')
  })
})

describe('listenersOn', () => {
  it("ignores atlas's own bridge, so a loopback-only service stays bridged", () => {
    const sockets = [
      { port: 47823, pid: 42, address: '127.0.0.1', command: 'node' },
      { port: 47823, pid: process.pid, address: '10.0.0.2', command: 'bun' },
    ]
    expect(routeMode(listenersOn(sockets, 47823, '10.0.0.2'))).toBe('bridge')
  })
})

describe('renderSiteBlock', () => {
  it('serves a service host next to its atlas.local name', () => {
    expect(renderSiteBlock('x', 1, '10.0.0.2', false, false, 'x.jurrejan.com')).toContain(
      'x.jurrejan.com, x.atlas.local.jurrejan.com {',
    )
  })
  process.env.CADDY_DEV_AUTH_HASH = 'hash'

  it('publishes atlas.remote by default', () => {
    expect(renderSiteBlock('x', 1, '10.0.0.2', false)).toContain('x.atlas.remote.')
  })

  it('drops atlas.remote when remote is off', () => {
    const block = renderSiteBlock('x', 1, '10.0.0.2', false, false)
    expect(block).toContain('x.atlas.local.')
    expect(block).not.toContain('atlas.remote')
  })
})
