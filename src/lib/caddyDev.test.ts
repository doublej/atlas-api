import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ensureRoute,
  hostnameState,
  hostnamesByPath,
  listHostnames,
  moveRoute,
  removeRoute,
  retryRoute,
} from './caddyDev'
import { readRegistry } from './hostnames/registry'

// The registry is a real file in a temp ~/dev; the NAS answers what `h.push`/`h.remove` say.
const h = await vi.hoisted(async () => {
  const { mkdtempSync, realpathSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  return {
    root: realpathSync(mkdtempSync(`${tmpdir()}/atlas-caddydev-`)),
    push: { ok: true } as { ok: boolean; error?: string },
    remove: { ok: true } as { ok: boolean; error?: string },
    pushed: [] as string[],
  }
})

vi.mock('./config', async (orig) => ({
  ...(await orig<typeof import('./config')>()),
  DEV_FOLDER: h.root,
}))
vi.mock('node:os', async (orig) => ({
  ...(await orig<typeof import('node:os')>()),
  networkInterfaces: () => ({ en0: [{ family: 'IPv4', internal: false, address: '10.0.0.2' }] }),
}))
vi.mock('./hostnames/nas', async (orig) => ({
  ...(await orig<typeof import('./hostnames/nas')>()),
  pushToNas: async (slug: string) => {
    h.pushed.push(slug)
    return h.push
  },
  removeFromNas: async () => h.remove,
}))
vi.mock('./hostnames/tracker', async (orig) => ({
  ...(await orig<typeof import('./hostnames/tracker')>()),
  watchLive: async () => {},
}))

const a = join(h.root, 'a')

beforeEach(async () => {
  await rm(join(h.root, '.atlas-hostnames.json'), { force: true })
  h.push = { ok: true }
  h.remove = { ok: true }
  h.pushed = []
})
afterAll(() => rm(h.root, { recursive: true, force: true }))

describe('retryRoute', () => {
  it('never takes an Object.prototype member for a row (slug "constructor")', async () => {
    await ensureRoute({ slug: 'zz-a', path: a, port: 4101 })
    h.pushed = []
    expect((await retryRoute('constructor')).state).toBe('none')
    expect((await hostnameState('constructor')).state).toBe('none')
    expect(h.pushed).toEqual([])
    expect(Object.keys(await readRegistry())).toEqual(['zz-a'])
  })
})

describe('moveRoute', () => {
  it("keeps the target row's own port when the project already has a live row there", async () => {
    await ensureRoute({ slug: 'zz-old', path: a, port: 4101 })
    await ensureRoute({ slug: 'zz-new', path: a, port: 4200 }) // `atlas run` after a slug edit
    h.pushed = []
    await moveRoute(a, 'zz-old', 'zz-new') // the doctor's slug-drift fix
    const rows = await readRegistry()
    expect(rows['zz-new']).toMatchObject({ port: 4200, nasSynced: true })
    expect(rows['zz-old']).toBeUndefined()
    expect(h.pushed).toEqual([])
  })
})

describe('listHostnames', () => {
  it('lists only what the NAS serves unless asked for all; the chips get all', async () => {
    await ensureRoute({ slug: 'zz-live', path: a, port: 4101 })
    await ensureRoute({ slug: 'zz-gone', path: join(h.root, 'c'), port: 4103 })
    h.remove = { ok: false, error: 'ssh down' }
    await removeRoute('zz-gone') // release-pending
    h.push = { ok: false, error: 'ssh down' }
    await ensureRoute({ slug: 'zz-failed', path: join(h.root, 'b'), port: 4102 })
    const slugs = (rows: { slug: string }[]) => rows.map((r) => r.slug).sort()
    expect(slugs(await listHostnames())).toEqual(['zz-live'])
    expect(slugs(await listHostnames({ all: true }))).toEqual(['zz-failed', 'zz-gone', 'zz-live'])
    expect(Object.keys(await hostnamesByPath())).toHaveLength(3)
  })
})
