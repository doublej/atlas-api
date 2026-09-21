import { describe, expect, it } from 'vitest'
import { renderSiteBlock } from './caddyDev'
import { routeMode } from './services'

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

describe('renderSiteBlock', () => {
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
