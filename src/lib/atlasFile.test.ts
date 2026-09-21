import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  depthLimit,
  isIgnored,
  patchAtlas,
  readAtlas,
  readConfig,
  writeConfig,
} from './atlasFile'
import { performScan } from './scanner'

const tmp = () => mkdtemp(join(tmpdir(), 'atlas-cfg-'))

const scanned = async (root: string): Promise<string[]> =>
  (await performScan(root, true)).projects.map((p) => p.relativePath).sort()

describe('depthLimit', () => {
  const config = { ...DEFAULT_CONFIG, depth: { 'python/suna': 5, python: 4 } }

  it('falls back to maxDepth', () => {
    expect(depthLimit(config, 'web/foo')).toBe(3)
  })

  it('takes the nearest ancestor, not the first match', () => {
    expect(depthLimit(config, 'python/suna/apps')).toBe(5)
    expect(depthLimit(config, 'python/other')).toBe(4)
  })

  it('does not match a partial path segment', () => {
    expect(depthLimit(config, 'python-tools/x')).toBe(3)
  })
})

describe('patchAtlas', () => {
  it('merges, creates and deletes with null', async () => {
    const dir = await tmp()
    await patchAtlas(dir, { type: 'python', port: 4100 })
    await patchAtlas(dir, { port: null, description: 'hi' })
    expect(await readAtlas(dir)).toEqual({ type: 'python', description: 'hi' })
    expect(await readFile(join(dir, '.atlas'), 'utf-8')).toMatch(/\n$/)
  })
})

describe('scan config', () => {
  it('honours force and depth overrides', async () => {
    const root = await tmp()
    // five levels down — one past what the default depth of 3 reaches
    await mkdir(join(root, 'plain/a/b/deep/app'), { recursive: true })
    await writeFile(join(root, 'plain/a/b/deep/app/package.json'), '{"name":"app"}')
    // repo is a project, with a project inside it
    await mkdir(join(root, 'repo/web'), { recursive: true })
    await writeFile(join(root, 'repo/package.json'), '{"name":"repo"}')
    await writeFile(join(root, 'repo/web/package.json'), '{"name":"web"}')

    expect(await scanned(root)).toEqual(['repo'])

    await writeConfig(root, { maxDepth: 5, depth: {}, force: {}, ignore: [] })
    expect(await readConfig(root)).toMatchObject({ maxDepth: 5 })
    expect(await scanned(root)).toEqual(['plain/a/b/deep/app', 'repo'])

    // `depth` is the only way past a project; `force` catalogs a folder and stops there.
    await writeConfig(root, {
      maxDepth: 5,
      depth: { repo: 4 },
      force: { 'plain/a': true },
      ignore: ['repo/web'],
    })
    // `repo/web` is reachable via depth but ignored, so the walk drops it again.
    expect(await scanned(root)).toEqual(['plain/a', 'repo'])
  })
})

describe('isIgnored', () => {
  const withPatterns = (...ignore: string[]) => ({ ...DEFAULT_CONFIG, ignore })

  it('matches a bare folder name at any depth, subtree included', () => {
    const config = withPatterns('app-worktrees')
    expect(isIgnored(config, 'multi-stack/framelink/app-worktrees')).toBe(true)
    expect(isIgnored(config, 'multi-stack/framelink/app-worktrees/uqb5')).toBe(true)
    expect(isIgnored(config, 'multi-stack/framelink/app')).toBe(false)
  })

  it('is forgiving about a starred path, whatever depth it sits at', () => {
    const config = withPatterns(['*', 'app-worktrees', '*'].join('/'))
    expect(isIgnored(config, 'multi-stack/framelink/app-worktrees/uqb5')).toBe(true)
  })

  it('anchors a leading slash to the scan root', () => {
    const config = withPatterns('/_data/**')
    expect(isIgnored(config, '_data/renders')).toBe(true)
    expect(isIgnored(config, 'web/_data/renders')).toBe(false)
  })

  it('keeps * inside one segment', () => {
    expect(isIgnored(withPatterns('web/*'), 'web/shop/api')).toBe(true)
    expect(isIgnored(withPatterns('web/*-old'), 'web/shop')).toBe(false)
  })
})
