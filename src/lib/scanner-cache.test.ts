import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { scan } from './scanner'

const cache = (projects: unknown[], size = 0) => ({
  projects,
  folders: [],
  frameworks: [],
  scannedAt: new Date().toISOString(),
  cachedAt: Date.now(),
  shapeVersion: 6,
  pad: 'x'.repeat(size),
})

describe('scan() cache memo', () => {
  it('parses the cache once and re-reads it after a rewrite', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atlas-memo-'))
    writeFileSync(join(dir, '.atlas-cache.json'), JSON.stringify(cache([{ name: 'a' }])))
    const first = await scan(dir)
    const second = await scan(dir)
    expect(second.projects).toBe(first.projects)

    writeFileSync(join(dir, '.atlas-cache.json'), JSON.stringify(cache([{ name: 'b' }], 3)))
    const third = await scan(dir)
    expect(third.projects.map((p) => p.name)).toEqual(['b'])
  })
})
