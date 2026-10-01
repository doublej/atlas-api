import { type AddressInfo, createServer } from 'node:net'
import { describe, expect, it } from 'vitest'
import { getServices } from '$shared/services'
import { renderSiteBlock } from './hostnames/nas'
import { dialLoopback, listenersOn, routedProjectPorts, routeMode } from './services'

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

  it('bridges a loopback-only project dev server the same way (3.10)', () => {
    const sockets = [{ port: 4321, pid: 7, address: '127.0.0.1', command: 'bun' }]
    expect(routeMode(listenersOn(sockets, 4321))).toBe('bridge')
  })
})

const block = {
  slug: 'x',
  port: 1,
  ip: '10.0.0.2',
  devPublic: false,
  remote: true,
  authHash: 'hash',
}

describe('renderSiteBlock', () => {
  it('serves a service host next to its atlas.local name', () => {
    expect(renderSiteBlock({ ...block, remote: false, host: 'x.jurrejan.com' })).toContain(
      'x.jurrejan.com, x.atlas.local.jurrejan.com {',
    )
  })

  it('has no remote half without an auth hash, even when asked', () => {
    expect(renderSiteBlock({ ...block, authHash: undefined })).not.toContain('atlas.remote')
  })

  it('publishes atlas.remote by default, behind the hash it is given', () => {
    expect(renderSiteBlock(block)).toContain('x.atlas.remote.')
    expect(renderSiteBlock(block)).toContain('\t\tdev hash\n')
  })

  it('drops atlas.remote when remote is off', () => {
    const out = renderSiteBlock({ ...block, remote: false })
    expect(out).toContain('x.atlas.local.')
    expect(out).not.toContain('atlas.remote')
  })

  it('serves a devPublic remote half without the password (4.3)', () => {
    expect(renderSiteBlock(block)).toContain('basic_auth')
    const out = renderSiteBlock({ ...block, devPublic: true })
    expect(out).toContain('x.atlas.remote.')
    expect(out).not.toContain('basic_auth')
  })

  it('compresses both halves of a service block, never a project block (2.6)', () => {
    const service = renderSiteBlock({ ...block, compress: true })
    expect(service.match(/^\tencode zstd gzip$/gm)).toHaveLength(2)
    expect(renderSiteBlock(block)).not.toContain('encode')
  })
})

describe('the atlas console block (decision 1, 2.4)', () => {
  const atlas = getServices().find((s) => s.slug === 'atlas')

  it('is published off-LAN', () => {
    expect(atlas?.remote).toBe(true)
  })

  it('serves atlas.atlas.remote behind the password, compressed, on the short LAN name too', () => {
    const out = renderSiteBlock({
      authHash: 'hash',
      slug: 'atlas',
      port: atlas?.port ?? 0,
      ip: '10.0.0.2',
      devPublic: false,
      remote: atlas?.remote ?? false,
      host: atlas?.host,
      compress: true,
    })
    expect(out).toContain('atlas.jurrejan.com, atlas.atlas.local.jurrejan.com {')
    const remote = out.slice(out.indexOf('atlas.atlas.remote.jurrejan.com {'))
    expect(remote).toMatch(
      /^atlas\.atlas\.remote\.jurrejan\.com \{\n\tencode zstd gzip\n\tbasic_auth \{/,
    )
    expect(remote).toContain('reverse_proxy 10.0.0.2:47891 {')
  })
})

describe('routedProjectPorts', () => {
  it('takes project rows once each and skips services and pending releases', () => {
    const at = '2026-10-01T00:00:00Z'
    expect(
      routedProjectPorts({
        a: { path: '/x/a', port: 4126, registeredAt: at },
        b: { path: '/x/b', port: 4126, registeredAt: at },
        c: { path: '/x/c', port: 4200, release: true, registeredAt: at },
        atlas: { service: true, port: 47891, registeredAt: at },
      }),
    ).toEqual([4126])
  })
})

describe('dialLoopback', () => {
  it('reaches a dev server bound to [::1] only, the way Vite binds localhost', async () => {
    const server = createServer((c) => c.end('ok'))
    await new Promise<void>((resolve) => server.listen(0, '::1', resolve))
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = dialLoopback((server.address() as AddressInfo).port)
      socket.on('data', (d) => resolve(String(d)))
      socket.on('error', reject)
    }).finally(() => server.close())
    expect(reply).toBe('ok')
  })
})
