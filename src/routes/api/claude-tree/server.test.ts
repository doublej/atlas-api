import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { appendHistory, readHistory, sha } from '$lib/claude-tree-history'

// The catalog boundary is DEV_FOLDER; point it at a scratch folder.
const dir = vi.hoisted(
  () => `${(process.env.TMPDIR ?? '/tmp').replace(/\/$/, '')}/claude-tree-revert-${process.pid}`,
)
vi.mock('$lib/config', async (orig) => ({ ...(await orig<object>()), DEV_FOLDER: dir }))

afterAll(() => rm(dir, { recursive: true, force: true }))

const revert = async (path: string, expectedSha: string) => {
  const { POST } = await import('./+server')
  const body = JSON.stringify({ op: 'revert', path, expectedSha })
  return POST({ request: new Request('http://localhost/', { method: 'POST', body }) } as never)
}

describe('POST /api/claude-tree revert', () => {
  it('refuses to overwrite a version the editor never read, and reverts the one it did', async () => {
    await mkdir(dir, { recursive: true })
    const file = join(dir, 'CLAUDE.md')
    await appendHistory(file, 'snapshot')
    await writeFile(file, 'newer, from another session')

    const res = await revert(file, sha('what the editor read'))
    expect(res.status).toBe(409)
    expect(await readFile(file, 'utf-8')).toBe('newer, from another session')
    expect(await readHistory(file)).toHaveLength(1)

    expect((await revert(file, sha('newer, from another session'))).status).toBe(200)
    expect(await readFile(file, 'utf-8')).toBe('snapshot')
  })
})
