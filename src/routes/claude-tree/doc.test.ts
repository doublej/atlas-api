import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '$lib/claude-tree'
import { HttpError } from '$lib/http'
import { type Ask, Doc, uniqueRefs } from './doc.svelte'

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('$lib/http', async (orig) => ({ ...(await orig<object>()), http }))
vi.mock('$lib/toast.svelte', () => ({ toast: vi.fn() }))

const node: TreeNode = {
  id: 'n1',
  path: '/r/web/CLAUDE.md',
  label: 'web',
  kind: 'project',
  parent: null,
  preview: { h1: '', blurb: '', sections: [], lines: 1, tokens: 1 },
  tokensAccumulated: 1,
  files: { claude: '/r/web/CLAUDE.md' },
}

function opened() {
  const asks: Ask[] = []
  const doc = new Doc((q) => asks.push(q))
  http.get.mockImplementation(async (url: string) =>
    url.includes('history=') ? [] : { content: 'disk', sha: 'aaa' },
  )
  return { doc, asks }
}

beforeEach(() => vi.clearAllMocks())

describe('Doc', () => {
  it('opens a file at its sha, clean', async () => {
    const { doc } = opened()
    await doc.open(node, node.path)
    expect(doc).toMatchObject({ content: 'disk', sha: 'aaa', dirty: false, status: 'sha aaa' })
    expect(doc.label).toBe('CLAUDE.md · web')
  })

  it('saves against the sha it read', async () => {
    const { doc } = opened()
    await doc.open(node, node.path)
    doc.edit('mine')
    http.post.mockResolvedValueOnce({ ok: true, sha: 'bbb' })
    await doc.save()
    expect(http.post).toHaveBeenCalledWith('/api/claude-tree', {
      op: 'save',
      path: node.path,
      content: 'mine',
      expectedSha: 'aaa',
    })
    expect(doc).toMatchObject({ sha: 'bbb', dirty: false, status: 'saved · sha bbb' })
  })

  it('asks before overwriting when the disk changed, and forces the save on yes', async () => {
    const { doc, asks } = opened()
    await doc.open(node, node.path)
    doc.edit('mine')
    http.post.mockRejectedValueOnce(new HttpError(409, 'disk changed'))
    await doc.save()
    expect(doc.dirty).toBe(true)
    expect(asks.map((a) => a.confirmLabel)).toEqual(['Overwrite'])

    http.post.mockResolvedValueOnce({ ok: true, sha: 'ccc' })
    await asks[0].run()
    expect(http.post).toHaveBeenLastCalledWith('/api/claude-tree', {
      op: 'save',
      path: node.path,
      content: 'mine',
      force: true,
    })
    expect(doc).toMatchObject({ sha: 'ccc', dirty: false })
  })

  it('reports any other save failure without asking', async () => {
    const { doc, asks } = opened()
    await doc.open(node, node.path)
    doc.edit('mine')
    http.post.mockRejectedValueOnce(new HttpError(403, 'nope'))
    await doc.save()
    expect(asks).toHaveLength(0)
    expect(doc.status).toBe('save failed: nope')
  })

  it('dedupes reference chips by target', () => {
    const r = { kind: 'link' as const, label: 'x', line: 1, targetId: null }
    const refs = [
      { ...r, rawPath: 'a.md', targetPath: '/r/a.md' },
      { ...r, rawPath: './a.md', targetPath: '/r/a.md', line: 2 },
      { ...r, rawPath: 'gone.md', targetPath: null },
    ]
    expect(uniqueRefs(refs).map((x) => x.rawPath)).toEqual(['a.md', 'gone.md'])
  })
})
