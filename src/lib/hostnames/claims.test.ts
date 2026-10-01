import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureRoute, moveRoute, removeRoute, retryRoute, SlugTakenError } from '../caddyDev'
import {
  applyFolderMove,
  assertPatchFree,
  checkSlug,
  planFolderMove,
  rerouteProject,
} from './claims'
import type { Registry } from './registry'

// The registry lives in memory, the NAS answers what `h.push`/`h.remove` say, and ~/dev is a
// temp folder, so a project's folder slug is just its folder name.
const h = await vi.hoisted(async () => {
  const { mkdtempSync, realpathSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  return {
    root: realpathSync(mkdtempSync(`${tmpdir()}/atlas-claims-`)),
    registry: {} as Registry,
    push: { ok: true } as { ok: boolean; error?: string },
    remove: { ok: true } as { ok: boolean; error?: string },
    pushed: [] as string[],
    removed: [] as string[],
  }
})

vi.mock('../config', async (orig) => ({
  ...(await orig<typeof import('../config')>()),
  DEV_FOLDER: h.root,
}))
vi.mock('node:os', async (orig) => ({
  ...(await orig<typeof import('node:os')>()),
  networkInterfaces: () => ({ en0: [{ family: 'IPv4', internal: false, address: '10.0.0.2' }] }),
}))
vi.mock('./registry', async (orig) => ({
  ...(await orig<typeof import('./registry')>()),
  readRegistry: async () => structuredClone(h.registry),
  writeRegistry: async (r: Registry) => {
    h.registry = structuredClone(r)
  },
}))
vi.mock('./nas', async (orig) => ({
  ...(await orig<typeof import('./nas')>()),
  pushToNas: async (slug: string) => {
    h.pushed.push(slug)
    return h.push
  },
  removeFromNas: async (slug: string) => {
    h.removed.push(slug)
    return h.remove
  },
}))
vi.mock('./tracker', async (orig) => ({
  ...(await orig<typeof import('./tracker')>()),
  watchLive: async () => {},
}))

const a = join(h.root, 'a')
const b = join(h.root, 'b')
const setSlug = (dir: string, slug?: string) =>
  writeFile(join(dir, '.atlas'), JSON.stringify(slug ? { slug } : {}))

beforeAll(async () => {
  await mkdir(a)
  await mkdir(b)
})
afterAll(() => rm(h.root, { recursive: true, force: true }))

beforeEach(async () => {
  delete process.env.CADDY_DEV_AUTH_HASH
  await setSlug(a)
  await setSlug(b)
  h.registry = {}
  h.push = { ok: true }
  h.remove = { ok: true }
  await ensureRoute({ slug: 'zz-b', path: b, port: 4102 })
  h.pushed = []
  h.removed = []
})

const route = (slug: string, port = 4101) => ensureRoute({ slug, path: a, port })

describe('checkSlug', () => {
  it('answers without a claimant: free, taken or invalid, never current', async () => {
    expect((await checkSlug('zz-free', undefined, [])).status).toBe('free')
    expect((await checkSlug('atlas', undefined, [])).holder?.kind).toBe('service')
    expect(await checkSlug('zz-b', undefined, [])).toMatchObject({
      status: 'taken',
      holder: { kind: 'project', path: b },
    })
    expect((await checkSlug('a--b', undefined, [])).status).toBe('invalid')
  })

  it("calls a project's own slug current and another project's taken", async () => {
    expect((await checkSlug('zz-b', b, [])).status).toBe('current')
    expect((await checkSlug('a', a, [])).status).toBe('current') // the folder slug, no row
    expect((await checkSlug('zz-b', a, [])).status).toBe('taken')
    const scanned = [{ path: b, slug: 'zz-scanned', name: 'b', isLocal: true }]
    expect((await checkSlug('zz-scanned', a, scanned)).holder).toMatchObject({ path: b })
  })
})

describe('assertPatchFree', () => {
  it('refuses a slug change onto a held slug before anything is written', async () => {
    await expect(assertPatchFree(a, { slug: 'zz-b' }, [])).rejects.toBeInstanceOf(SlugTakenError)
    await expect(assertPatchFree(a, { slug: 'zz-new' }, [])).resolves.toBeUndefined()
  })

  it("checks the slug the route moves to, even when the patch doesn't name one", async () => {
    await route('zz-a')
    await setSlug(a, 'zz-b') // a hand edit drifted the .atlas slug onto b's hostname
    await expect(assertPatchFree(a, { port: 4200 }, [])).rejects.toBeInstanceOf(SlugTakenError)
    await setSlug(a, 'zz-a')
    await expect(assertPatchFree(a, { port: 4200 }, [])).resolves.toBeUndefined()
  })
})

describe('planFolderMove', () => {
  it('has nothing to plan without a route', async () => {
    expect(await planFolderMove(a, join(h.root, 'c'))).toEqual([])
  })

  it('keeps the hostname when the .atlas slug does, and follows the folder otherwise', async () => {
    const c = join(h.root, 'c')
    await route('a')
    expect(await planFolderMove(a, c)).toEqual([{ path: c, from: 'a', to: 'c' }])
    await setSlug(a, 'a')
    expect(await planFolderMove(a, c)).toEqual([{ path: c, from: 'a', to: 'a' }])
  })

  it("refuses a move onto another project's hostname", async () => {
    await route('a')
    await expect(planFolderMove(a, join(h.root, 'zz-b'))).rejects.toBeInstanceOf(SlugTakenError)
  })

  it('does not blame the project for its own slug after a half-finished reroute', async () => {
    await route('zz-a')
    await setSlug(a, 'zz-a2')
    h.remove = { ok: false, error: 'ssh down' } // the old route stays, release-pending
    await rerouteProject(a, { slug: 'zz-a2' })
    const c = join(h.root, 'c')
    expect(await planFolderMove(a, c)).toEqual([{ path: c, from: 'zz-a2', to: 'zz-a2' }])
  })

  it('carries the routes of projects nested in the moved folder', async () => {
    const w = join(h.root, 'w')
    const v = join(h.root, 'v')
    await mkdir(join(w, 'ui'), { recursive: true })
    await ensureRoute({ slug: 'w-ui', path: join(w, 'ui'), port: 4103 })
    const moves = await planFolderMove(w, v)
    await rename(w, v)
    expect(await applyFolderMove(moves, v)).toBeUndefined() // w itself has no route
    expect(h.registry['v-ui']).toMatchObject({ path: join(v, 'ui'), nasSynced: true })
    expect(h.registry['w-ui']).toBeUndefined()
  })
})

describe('rerouteProject', () => {
  it('leaves a project without a route, or with nothing route-relevant changed, alone', async () => {
    expect(await rerouteProject(a, {})).toBeUndefined()
    await route('a')
    h.pushed = []
    expect(await rerouteProject(a, { port: 4101 })).toBeUndefined()
    expect(h.pushed).toEqual([])
  })

  it('leaves a released route released', async () => {
    await route('a')
    h.remove = { ok: false, error: 'ssh down' }
    await removeRoute('a')
    h.pushed = []
    expect(await rerouteProject(a, { port: 4300 })).toBeUndefined()
    expect(h.pushed).toEqual([])
    expect(h.registry.a).toMatchObject({ port: 4101, release: true })
  })

  it('moves the route to the new slug and drops the old one', async () => {
    await route('a')
    await setSlug(a, 'zz-a2')
    const state = await rerouteProject(a, { slug: 'zz-a2' })
    expect(state).toMatchObject({ slug: 'zz-a2', nasSynced: true })
    expect([h.pushed, h.removed]).toEqual([['a', 'zz-a2'], ['a']])
    expect(Object.keys(h.registry).sort()).toEqual(['zz-a2', 'zz-b'])
  })
})

describe('moveRoute', () => {
  it('keeps the old route when the new one never reached the NAS', async () => {
    await route('zz-a')
    h.push = { ok: false, error: 'ssh down' }
    expect(await moveRoute(a, 'zz-a', 'zz-a2')).toMatchObject({ state: 'failed', nasSynced: false })
    expect(h.removed).toEqual([])
    expect(h.registry['zz-a']).toMatchObject({ path: a, nasSynced: true })
  })

  it('says so when the old route could not be removed', async () => {
    await route('zz-a')
    h.remove = { ok: false, error: 'ssh down' }
    const state = await moveRoute(a, 'zz-a', 'zz-a2')
    expect(state.error).toContain('old hostname zz-a kept')
    expect(h.registry['zz-a']).toMatchObject({ nasSynced: false, release: true })
  })
})

describe('removeRoute and retryRoute', () => {
  it('keeps the row of a failed release, and a retry finishes it (3.5)', async () => {
    await route('zz-a')
    h.remove = { ok: false, error: 'ssh down' }
    expect(await removeRoute('zz-a')).toMatchObject({ ok: false })
    expect(h.registry['zz-a']).toMatchObject({ nasSynced: false, release: true })
    h.remove = { ok: true }
    expect((await retryRoute('zz-a')).state).toBe('none')
    expect(h.registry['zz-a']).toBeUndefined()
  })

  it('pushes again on a retry, where a repeat assign is a no-op', async () => {
    await route('zz-a')
    h.pushed = []
    await route('zz-a')
    expect(h.pushed).toEqual([])
    await retryRoute('zz-a')
    expect(h.pushed).toEqual(['zz-a'])
  })
})
