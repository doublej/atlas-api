import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { pushToNas } from './nas'

// `ssh nas bash -s` runs the push script here instead: the NAS paths point into a temp folder,
// and a fake docker logs each call and fails `caddy validate` while any site file says "bad".
const h = await vi.hoisted(async () => {
  const { mkdtempSync, realpathSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  return { root: realpathSync(mkdtempSync(`${tmpdir()}/atlas-nas-`)) }
})

vi.mock('node:child_process', async (orig) => {
  const real = await orig<typeof import('node:child_process')>()
  const etc = `s|/share/CACHEDEV1_DATA/Container/caddy/etc|${h.root}/etc|g`
  const docker = `s|/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker|${h.root}/docker|g`
  return {
    ...real,
    spawn: () => real.spawn('sh', ['-c', `sed -e '${etc}' -e '${docker}' | bash -s`]),
  }
})

afterAll(() => rm(h.root, { recursive: true, force: true }))

describe('pushToNas', () => {
  it('rolls back a block caddy validate rejects, and reloads only a valid one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sites = join(h.root, 'etc', 'sites')
    const log = join(h.root, 'docker.log')
    await mkdir(sites, { recursive: true })
    await writeFile(
      join(h.root, 'docker'),
      `#!/bin/sh\necho "$*" >> '${log}'\ncase "$*" in *validate*) ! grep -q bad '${sites}'/*.caddy;; esac\n`,
    )
    await chmod(join(h.root, 'docker'), 0o755)
    await writeFile(join(sites, 'web-a-atlas.caddy'), 'good\n')

    expect((await pushToNas('web-a', 'bad')).ok).toBe(false)
    expect(await readFile(join(sites, 'web-a-atlas.caddy'), 'utf-8')).toBe('good\n')
    expect((await pushToNas('web-b', 'bad')).ok).toBe(false)
    expect(existsSync(join(sites, 'web-b-atlas.caddy'))).toBe(false)
    expect(await readFile(log, 'utf-8')).not.toContain('reload')

    expect((await pushToNas('web-a', 'better')).ok).toBe(true)
    expect(await readFile(join(sites, 'web-a-atlas.caddy'), 'utf-8')).toBe('better\n')
    expect(existsSync(join(h.root, 'etc', 'web-a-atlas.caddy.prev'))).toBe(false)
    expect(await readFile(log, 'utf-8')).toContain('caddy reload')
  }, 30_000) // three real shell round-trips, on a loaded machine
})
