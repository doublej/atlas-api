import { describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '$lib/claude-tree'
import { AgentActions, fileEntity } from './agent.svelte'
import { Doc } from './doc.svelte'

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
  files: { claude: '/r/web/CLAUDE.md', agents: '/r/web/AGENTS.md' },
}

describe('AgentActions', () => {
  it('drops an edit whose file was switched away from while the agent ran', async () => {
    http.get.mockImplementation(async (url: string) =>
      url.includes('history=') ? [] : { content: `text of ${url}`, sha: 'aaa' },
    )
    const doc = new Doc(() => {})
    const agent = new AgentActions(doc)
    await doc.open(node, '/r/web/CLAUDE.md')
    agent.open(fileEntity(doc.content, 'CLAUDE.md'), { x: 0, y: 0 })

    let reply: (r: unknown) => void = () => {}
    http.post.mockReturnValueOnce(new Promise((resolve) => (reply = resolve)))
    const running = agent.run({ actionId: 'shorten', locked: false })
    await doc.open(node, '/r/web/AGENTS.md')
    const agents = doc.content
    reply({ kind: 'edit', text: 'rewritten CLAUDE.md', engine: 'claude' })
    await running

    expect(doc).toMatchObject({ path: '/r/web/AGENTS.md', content: agents, dirty: false })
    expect(agent.menu).toBeNull()
  })
})
