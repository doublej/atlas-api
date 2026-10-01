// The visible graph for a scanned tree: which nodes show (collapse state), where they sit
// (dagre for the hierarchy, rules as sidecars) and which edges join them. Pure — the page
// keeps the state and calls buildGraph whenever the tree, collapse set or selection changes.

import type { Edge, Node } from '@xyflow/svelte'
import type { TreeNode } from '$lib/claude-tree'
import { CARD_W, cardHeight, layoutTree } from '$lib/tree-layout'

/** Reference edges: show all, only those touching the selected node, or none. */
export type RefsMode = 'all' | 'selected' | 'off'

/** all → only-selected → off → all. */
export const nextRefsMode = (m: RefsMode): RefsMode =>
  m === 'all' ? 'selected' : m === 'selected' ? 'off' : 'all'

export interface GraphInput {
  tree: TreeNode[]
  byId: Map<string, TreeNode>
  collapsed: Set<string>
  refsMode: RefsMode
  selectedId: string | null
}

/** A node is hidden when any ancestor up its chain is collapsed. */
export function isVisible(t: TreeNode, byId: Map<string, TreeNode>, collapsed: Set<string>) {
  let p = t.parent
  while (p) {
    if (collapsed.has(p)) return false
    p = byId.get(p)?.parent ?? null
  }
  return true
}

export function descendantCount(tree: TreeNode[], id: string): number {
  let n = 0
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop() as string
    for (const t of tree)
      if (t.parent === cur) {
        n++
        stack.push(t.id)
      }
  }
  return n
}

export const hasChildren = (tree: TreeNode[], id: string): boolean =>
  tree.some((t) => t.parent === id)

/** Distinct other-node targets this node references (drives the card badge). */
export function refCountOf(t: TreeNode): number {
  const ids = (t.references ?? [])
    .filter((r) => r.targetId && r.targetId !== t.id)
    .map((r) => r.targetId)
  return new Set(ids).size
}

function toCardNode(t: TreeNode, g: GraphInput): Node {
  return {
    id: t.id,
    type: 'claudeCard',
    position: { x: 0, y: 0 },
    selected: g.selectedId === t.id,
    data: {
      label: t.label,
      kind: t.kind,
      preview: t.preview,
      tokensAccumulated: t.tokensAccumulated,
      collapsed: g.collapsed.has(t.id),
      hidden: g.collapsed.has(t.id) ? descendantCount(g.tree, t.id) : 0,
      hasAgents: !!t.files?.agents,
      globs: t.preview.globs,
      refs: refCountOf(t),
      height: cardHeight(t.preview), // layout height — compact LOD reuses it for a same-size card
    },
  }
}

const RULE_GAP_X = 80
const RULE_GAP_Y = 24

/**
 * Rule sidecars: sit to the RIGHT of their owning node, stacked if several, joined by a
 * distinct dashed rule-colored edge (right → left handles). Returns the `parent->rule` pairs
 * so the reference pass can skip a reference the sidecar edge already draws.
 */
function placeRules(
  rules: TreeNode[],
  pos: Map<string, Node['position']>,
  g: GraphInput,
  visible: Set<string>,
) {
  const perParent = new Map<string, number>()
  const nodes: Node[] = []
  const edges: Edge[] = []
  const connected = new Set<string>()
  for (const r of rules) {
    const n = toCardNode(r, g)
    const base = r.parent ? pos.get(r.parent) : undefined
    const idx = r.parent ? (perParent.get(r.parent) ?? 0) : 0
    if (r.parent) perParent.set(r.parent, idx + 1)
    n.position = {
      x: (base?.x ?? 0) + CARD_W + RULE_GAP_X,
      y: (base?.y ?? 0) + idx * (cardHeight(r.preview) + RULE_GAP_Y),
    }
    nodes.push(n)
    if (r.parent && visible.has(r.parent)) {
      edges.push({
        id: `rule:${r.parent}->${r.id}`,
        source: r.parent,
        target: r.id,
        sourceHandle: 'r',
        targetHandle: 'l',
        type: 'smoothstep',
        data: { kind: 'rule' },
        style:
          'stroke: var(--kind-rule); stroke-width: 1.5px; stroke-dasharray: 2 4; opacity: 0.9;',
      })
      connected.add(`${r.parent}->${r.id}`)
    }
  }
  return { nodes, edges, connected }
}

/**
 * Reference edges flow horizontally (right → left handles), straight + animated, and
 * overlay on top. Honors refsMode: all / only-selected / off.
 */
function referenceEdges(
  vis: TreeNode[],
  visible: Set<string>,
  covered: Set<string>,
  g: GraphInput,
) {
  const sel = g.selectedId
  const seen = new Set<string>()
  const edges: Edge[] = []
  if (g.refsMode === 'off') return edges
  for (const t of vis) {
    for (const r of t.references ?? []) {
      if (!r.targetId || r.targetId === t.id || !visible.has(r.targetId)) continue
      if (g.refsMode === 'selected' && t.id !== sel && r.targetId !== sel) continue
      if (covered.has(`${t.id}->${r.targetId}`)) continue // rule sidecar edge covers it
      const id = `ref:${t.id}->${r.targetId}`
      if (seen.has(id)) continue
      seen.add(id)
      edges.push({
        id,
        source: t.id,
        target: r.targetId,
        sourceHandle: 'r',
        targetHandle: 'l',
        type: 'straight',
        animated: true,
        data: { kind: 'reference' },
        style: 'stroke: var(--color-accent); stroke-width: 1.5px; opacity: 0.85;',
      })
    }
  }
  return edges
}

/** The visible graph from the tree + collapse set, laid out. */
export function buildGraph(g: GraphInput): { nodes: Node[]; edges: Edge[] } {
  const vis = g.tree.filter((t) => isVisible(t, g.byId, g.collapsed))
  const visible = new Set(vis.map((t) => t.id))
  // Rules are not part of the hierarchy — they hang off the side of their owning
  // CLAUDE.md. Lay out only the hierarchy with dagre, then place rules as sidecars.
  const treeVis = vis.filter((t) => t.kind !== 'rule')

  // Tree edges (parent → child) flow vertically (bottom → top handles) and drive the layout.
  const treeEdges: Edge[] = treeVis
    .filter((t) => t.parent && visible.has(t.parent))
    .map((t) => ({
      id: `${t.parent}->${t.id}`,
      source: t.parent as string,
      target: t.id,
      sourceHandle: 'b',
      targetHandle: 't',
      type: 'smoothstep',
    }))
  const laid = layoutTree(
    treeVis.map((t) => toCardNode(t, g)),
    treeEdges,
  )
  const pos = new Map(laid.map((n) => [n.id, n.position]))
  const rules = placeRules(
    vis.filter((t) => t.kind === 'rule'),
    pos,
    g,
    visible,
  )
  return {
    nodes: [...laid, ...rules.nodes],
    edges: [...treeEdges, ...rules.edges, ...referenceEdges(vis, visible, rules.connected, g)],
  }
}

/** The node plus its ancestor chain, ordered root → … → node (load order). */
export function ancestorChain(node: TreeNode, byId: Map<string, TreeNode>): TreeNode[] {
  const chain: TreeNode[] = []
  let cur: TreeNode | undefined = node
  while (cur) {
    chain.unshift(cur)
    cur = cur.parent ? byId.get(cur.parent) : undefined
  }
  return chain
}

/** The folder containing a node's file (strip the trailing `/CLAUDE.md`). */
export function folderOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : path
}
