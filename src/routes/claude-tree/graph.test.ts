import { describe, expect, it } from 'vitest'
import type { Reference, TreeNode } from '$lib/claude-tree'
import { CARD_W } from '$lib/tree-layout'
import {
  ancestorChain,
  buildGraph,
  descendantCount,
  folderOf,
  type GraphInput,
  isVisible,
  nextRefsMode,
  refCountOf,
} from './graph'

const ref = (targetId: string): Reference => ({
  kind: 'link',
  label: targetId,
  rawPath: `${targetId}.md`,
  line: 1,
  targetPath: `/r/${targetId}.md`,
  targetId,
})

const node = (id: string, parent: string | null, extra: Partial<TreeNode> = {}): TreeNode => ({
  id,
  path: `/r/${id}/CLAUDE.md`,
  label: id,
  kind: parent ? 'descendant' : 'project',
  parent,
  preview: { h1: id, blurb: '', sections: [], lines: 1, tokens: 1 },
  tokensAccumulated: 1,
  ...extra,
})

// root ─┬─ a ── a1
//       └─ b
// rule hangs off root; a references b; root references its own rule.
const tree: TreeNode[] = [
  node('root', null, { references: [ref('rule')] }),
  node('a', 'root', { references: [ref('b'), ref('b'), ref('a')] }),
  node('a1', 'a'),
  node('b', 'root'),
  node('rule', 'root', { kind: 'rule' }),
  node('rule2', 'root', { kind: 'rule' }),
]
const byId = new Map(tree.map((t) => [t.id, t]))
const input = (over: Partial<GraphInput> = {}): GraphInput => ({
  tree,
  byId,
  collapsed: new Set(),
  refsMode: 'all',
  selectedId: null,
  ...over,
})
const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort()

describe('visibility', () => {
  it('hides every node under a collapsed ancestor', () => {
    const collapsed = new Set(['a'])
    expect(isVisible(byId.get('a1') as TreeNode, byId, collapsed)).toBe(false)
    expect(isVisible(byId.get('a') as TreeNode, byId, collapsed)).toBe(true)
  })

  it('counts descendants at any depth', () => {
    expect(descendantCount(tree, 'root')).toBe(5)
    expect(descendantCount(tree, 'a')).toBe(1)
    expect(descendantCount(tree, 'b')).toBe(0)
  })

  it('counts distinct references to other nodes', () => {
    expect(refCountOf(byId.get('a') as TreeNode)).toBe(1)
  })
})

describe('buildGraph', () => {
  it('lays out every visible node and joins the hierarchy with tree edges', () => {
    const g = buildGraph(input())
    expect(ids(g.nodes)).toEqual(['a', 'a1', 'b', 'root', 'rule', 'rule2'])
    expect(g.edges.filter((e) => !e.data).map((e) => e.id)).toEqual(['root->a', 'a->a1', 'root->b'])
  })

  it('drops a collapsed branch and reports how many nodes it hides', () => {
    const g = buildGraph(input({ collapsed: new Set(['a']) }))
    expect(ids(g.nodes)).not.toContain('a1')
    expect(g.nodes.find((n) => n.id === 'a')?.data).toMatchObject({ collapsed: true, hidden: 1 })
  })

  it('stacks rules to the right of their owner with a dashed sidecar edge', () => {
    const g = buildGraph(input())
    const pos = (id: string) => g.nodes.find((n) => n.id === id)?.position
    expect(pos('rule')?.x).toBe((pos('root')?.x ?? 0) + CARD_W + 80)
    expect(pos('rule2')?.y).toBeGreaterThan(pos('rule')?.y ?? 0)
    expect(g.edges.find((e) => e.id === 'rule:root->rule')?.style).toContain('dasharray')
  })

  it('draws a reference once, never to itself, and not where a rule edge already runs', () => {
    const refs = buildGraph(input()).edges.filter((e) => e.data?.kind === 'reference')
    expect(refs.map((e) => e.id)).toEqual(['ref:a->b'])
  })

  it('shows only the selected node’s references in selected mode, none when off', () => {
    const refsOf = (over: Partial<GraphInput>) =>
      buildGraph(input(over)).edges.filter((e) => e.data?.kind === 'reference').length
    expect(refsOf({ refsMode: 'selected', selectedId: 'b' })).toBe(1)
    expect(refsOf({ refsMode: 'selected', selectedId: 'a1' })).toBe(0)
    expect(refsOf({ refsMode: 'off' })).toBe(0)
  })

  it('marks the selected node', () => {
    const g = buildGraph(input({ selectedId: 'b' }))
    expect(g.nodes.filter((n) => n.selected).map((n) => n.id)).toEqual(['b'])
  })
})

describe('helpers', () => {
  it('cycles reference modes all → selected → off → all', () => {
    expect(nextRefsMode('all')).toBe('selected')
    expect(nextRefsMode('selected')).toBe('off')
    expect(nextRefsMode('off')).toBe('all')
  })

  it('walks the ancestor chain root first', () => {
    expect(ancestorChain(byId.get('a1') as TreeNode, byId).map((t) => t.id)).toEqual([
      'root',
      'a',
      'a1',
    ])
  })

  it('takes the folder of a file path', () => {
    expect(folderOf('/r/a/CLAUDE.md')).toBe('/r/a')
    expect(folderOf('CLAUDE.md')).toBe('CLAUDE.md')
  })
})
