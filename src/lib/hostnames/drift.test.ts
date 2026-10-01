import { describe, expect, it } from 'vitest'
import { type DriftInput, findDrift, inRange } from './drift'
import { parseNas } from './nas'
import type { HostnameEntry } from './registry'

const DEV = '/Users/u/dev'
const row = (over: Partial<HostnameEntry> = {}): HostnameEntry => ({
  path: `${DEV}/web/a`,
  port: 4101,
  ip: '10.0.0.2',
  registeredAt: '',
  nasSynced: true,
  ...over,
})
const site = (slug: string, port = 4101, remote = true) => ({
  file: `${slug}-atlas.caddy`,
  hosts: [
    `${slug}.atlas.local.jurrejan.com`,
    ...(remote ? [`${slug}.atlas.remote.jurrejan.com`] : []),
  ],
  upstreams: [`10.0.0.2:${port}`, ...(remote ? [`10.0.0.2:${port}`] : [])],
})
const wildcard = { file: 'atlas-wildcard.caddy', hosts: [], upstreams: [] }

function input(over: Partial<DriftInput> = {}): DriftInput {
  const rows = over.rows ?? { 'web-a': row() }
  return {
    raw: structuredClone(rows),
    rows,
    projects: new Map([[`${DEV}/web/a`, 'web-a']]),
    folders: new Set(),
    services: [],
    listening: new Set(),
    nas: { sites: [wildcard, site('web-a')], adminRanges: [] },
    ip: '10.0.0.2',
    authHash: true,
    wan: { inAdminRanges: true, dnsMatches: true },
    devFolder: DEV,
    ...over,
  }
}

const kinds = (i: DriftInput) => findDrift(i).map((d) => d.id)

describe('findDrift', () => {
  it('finds nothing when everything agrees', () => {
    expect(findDrift(input())).toEqual([])
  })

  it('flags a row whose project is gone, with a release fix', () => {
    const [d] = findDrift(input({ projects: new Map() }))
    expect(d).toMatchObject({ id: 'orphan-row:web-a', fix: { label: 'Release' } })
  })

  it('never offers to release a row whose folder is still there, only out of the catalog', () => {
    const [d] = findDrift(input({ projects: new Map(), folders: new Set([`${DEV}/web/a`]) }))
    expect(d).toMatchObject({ id: 'orphan-row:web-a', fix: null })
    expect(d.detail).toContain('the scan skips it')
  })

  it("flags a slug the project no longer has (the route didn't move)", () => {
    const [d] = findDrift(input({ projects: new Map([[`${DEV}/web/a`, 'a']]) }))
    expect(d).toMatchObject({ kind: 'slug-drift', slug: 'web-a', fix: { label: 'Move to a' } })
  })

  it('flags an unsynced row and a failed release, never as a missing file too', () => {
    const rows = { 'web-a': row({ nasSynced: false }), 'web-b': row({ release: true }) }
    const nas = { sites: [wildcard], adminRanges: [] }
    const projects = new Map([[`${DEV}/web/a`, 'web-a']])
    const found = findDrift(input({ rows, nas, projects })).filter((d) => d.kind !== 'orphan-row')
    expect(found.map((d) => [d.id, d.fix?.label])).toEqual([
      ['unsynced:web-a', 'Retry push'],
      ['unsynced:web-b', 'Retry release'],
    ])
  })

  it('flags a ~/Documents/development path that only resolves through the symlink', () => {
    const i = input()
    i.raw['web-a'].path = '/Users/u/Documents/development/web/a'
    expect(kinds(i)).toEqual(['stale-path:web-a'])
  })

  it('reports the legacy .dev. file for JJ and offers to remove an atlas file with no row', () => {
    const legacy = { file: 'multi-stack-framelink-homepage-dev.caddy', hosts: [], upstreams: [] }
    const nas = { sites: [wildcard, site('web-a'), site('zz'), legacy], adminRanges: [] }
    const found = findDrift(input({ nas }))
    expect(found.find((d) => d.id === 'orphan-site-file:zz-atlas.caddy')?.fix).toEqual({
      label: 'Remove file',
    })
    expect(found.find((d) => d.id === `orphan-site-file:${legacy.file}`)).toMatchObject({
      fix: null,
      detail: 'legacy NAS file — ask JJ',
    })
  })

  it('flags a NAS file on another port, a missing remote half and a missing file', () => {
    const rows = {
      'web-a': row(),
      'web-b': row({ path: `${DEV}/web/b`, port: 4102 }),
      'web-c': row({ path: `${DEV}/web/c` }),
    }
    const nas = {
      sites: [wildcard, site('web-a', 5188), site('web-b', 4102, false)],
      adminRanges: [],
    }
    const projects = new Map([
      [`${DEV}/web/a`, 'web-a'],
      [`${DEV}/web/b`, 'web-b'],
      [`${DEV}/web/c`, 'web-c'],
    ])
    expect(kinds(input({ rows, nas, projects }))).toEqual([
      'port-mismatch:web-a',
      'remote-missing:web-b',
      'missing-site-file:web-c',
    ])
  })

  it('expects no remote half without an auth hash', () => {
    const nas = { sites: [wildcard, site('web-a', 4101, false)], adminRanges: [] }
    expect(findDrift(input({ nas, authHash: false }))).toEqual([])
  })

  it('flags a NAS file pointing at an old LAN IP', () => {
    expect(findDrift(input({ ip: '10.0.0.9' }))[0]?.detail).toContain('another LAN IP')
  })

  it('reports a service nothing listens on, and a service that left services.json', () => {
    const rows = {
      ports: row({ service: true, path: undefined, port: 47823 }),
      old: row({ service: true, path: undefined }),
    }
    const nas = { sites: [wildcard, site('ports', 47823), site('old')], adminRanges: [] }
    const found = findDrift(input({ rows, nas, services: [{ slug: 'ports', port: 47823 }] }))
    expect(found.map((d) => [d.id, d.fix])).toEqual([
      ['service-down:ports', null],
      ['orphan-row:old', { label: 'Release' }],
    ])
  })

  it('reports a missing wildcard, an unreachable NAS and WAN drift, all for JJ', () => {
    const noWildcard = findDrift(input({ nas: { sites: [site('web-a')], adminRanges: [] } }))
    expect(noWildcard.map((d) => [d.kind, d.fix])).toEqual([['wildcard-missing', null]])
    expect(kinds(input({ nas: null }))).toEqual(['nas-unreachable:nas'])
    const wan = findDrift(input({ wan: { inAdminRanges: false, dnsMatches: false } }))
    expect(wan.map((d) => d.id)).toEqual(['wan-drift:admin-ranges', 'wan-drift:dns'])
    expect(wan.every((d) => d.fix === null && !/\d+\.\d+\.\d+\.\d+/.test(d.detail))).toBe(true)
  })
})

describe('inRange', () => {
  it('matches a single address and a CIDR', () => {
    expect(inRange('203.0.113.7', '203.0.113.7')).toBe(true)
    expect(inRange('203.0.113.8', '203.0.113.7')).toBe(false)
    expect(inRange('192.168.1.99', '192.168.1.0/24')).toBe(true)
    expect(inRange('192.168.2.1', '192.168.1.0/24')).toBe(false)
  })
})

describe('parseNas', () => {
  it('reads site addresses, upstreams and admin ranges, nothing else', () => {
    const out = [
      '@@FILE web-a-atlas.caddy',
      'web-a.atlas.local.jurrejan.com {',
      '\t\treverse_proxy 10.0.0.2:4101 {',
      'web-a.atlas.remote.jurrejan.com {',
      '\treverse_proxy 10.0.0.2:4101 {',
      '@@FILE atlas-atlas.caddy',
      'atlas.jurrejan.com, atlas.atlas.local.jurrejan.com {',
      '@@ADMIN',
      '(admin_ranges) {',
      '\tremote_ip 203.0.113.7 192.168.1.0/24',
      '}',
    ].join('\n')
    expect(parseNas(out)).toEqual({
      sites: [
        {
          file: 'web-a-atlas.caddy',
          hosts: ['web-a.atlas.local.jurrejan.com', 'web-a.atlas.remote.jurrejan.com'],
          upstreams: ['10.0.0.2:4101', '10.0.0.2:4101'],
        },
        {
          file: 'atlas-atlas.caddy',
          hosts: ['atlas.jurrejan.com', 'atlas.atlas.local.jurrejan.com'],
          upstreams: [],
        },
      ],
      adminRanges: ['203.0.113.7', '192.168.1.0/24'],
    })
  })
})
