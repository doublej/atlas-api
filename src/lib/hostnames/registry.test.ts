import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { DEV_FOLDER } from '../config'
import { authHashFor, hostnamesFor, normalizePath, rowHolder } from './registry'

const here = process.cwd() // the worktree, somewhere under ~/dev
const entry = (path?: string) => ({ path, port: 4100, registeredAt: '' })

describe('rowHolder', () => {
  it('lets the same project take its own slug back', () => {
    expect(rowHolder('mine', entry(here), { path: here })).toBeNull()
  })

  it('refuses a slug another project still holds (409, project vs project)', () => {
    expect(rowHolder('web-x', entry(here), { path: `${here}/other` })).toEqual({
      kind: 'project',
      name: basename(here),
      path: here,
    })
  })

  it('frees a slug whose folder is gone', () => {
    expect(rowHolder('gone', entry('/nonexistent/zz'), { path: here })).toBeNull()
  })

  it('refuses a service slug to a project, even before the service has a row', () => {
    expect(rowHolder('atlas', undefined, { path: here })).toEqual({
      kind: 'service',
      name: 'Atlas console',
    })
  })

  it('refuses a project row to a service', () => {
    expect(rowHolder('web-x', entry(here), { service: true })?.kind).toBe('project')
    expect(rowHolder('atlas', { ...entry(), service: true }, { service: true })).toBeNull()
  })
})

describe('hostnamesFor', () => {
  it('reports no remote without an auth hash (3.7)', () => {
    delete process.env.CADDY_DEV_AUTH_HASH
    expect(hostnamesFor('x').remote).toBeNull()
  })

  it('reports no remote when the pushed block has none', () => {
    process.env.CADDY_DEV_AUTH_HASH = 'hash'
    expect(hostnamesFor('x', { remote: false }).remote).toBeNull()
    expect(hostnamesFor('x').remote).toBe('https://x.atlas.remote.jurrejan.com')
  })

  it("never offers a service's remote half on the dev-preview password", () => {
    process.env.CADDY_DEV_AUTH_HASH = 'hash'
    delete process.env.CADDY_SERVICE_AUTH_HASH
    expect(hostnamesFor('atlas', { service: true }).remote).toBeNull()
    expect(authHashFor(true)).toBeUndefined()
    process.env.CADDY_SERVICE_AUTH_HASH = 'service-hash'
    expect(hostnamesFor('atlas', { service: true }).remote).toBe(
      'https://atlas.atlas.remote.jurrejan.com',
    )
    expect(authHashFor(true)).toBe('service-hash')
    expect(authHashFor()).toBe('hash')
  })
})

describe('normalizePath', () => {
  let dir = ''
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('rewrites a path reached through a symlink to the ~/dev realpath (3.6)', async () => {
    dir = await mkdtemp(join(tmpdir(), 'atlas-registry-'))
    await symlink(DEV_FOLDER, join(dir, 'development'))
    const viaLink = join(dir, 'development', relative(DEV_FOLDER, here))
    expect(await normalizePath(viaLink)).toBe(here)
  })

  it('leaves a path that is gone, or outside ~/dev, alone', async () => {
    expect(await normalizePath('/nonexistent/zz')).toBe('/nonexistent/zz')
    expect(await normalizePath(here)).toBe(here)
  })
})
