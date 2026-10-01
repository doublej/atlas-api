// The scanned tree and the graph on screen: the full node list, which branches are
// collapsed, which reference edges show and which node is selected. buildGraph (graph.ts)
// turns that into laid-out nodes and edges.

import type { Edge, Node } from '@xyflow/svelte'
import { SvelteSet } from 'svelte/reactivity'
import type { TreeNode } from '$lib/claude-tree'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import { buildGraph, hasChildren, nextRefsMode, type RefsMode } from './graph'

export class TreeView {
  /** The full scan; nodes/edges are the visible (un-collapsed) subset. */
  tree = $state.raw<TreeNode[]>([])
  byId = new Map<string, TreeNode>()
  /** Node ids whose subtrees are hidden. */
  collapsed = new SvelteSet<string>()
  refsMode = $state<RefsMode>('all')
  selected: string | null = null
  nodes = $state.raw<Node[]>([])
  edges = $state.raw<Edge[]>([])
  loading = $state(true)
  error = $state<string | null>(null)

  /** Any agent-doc path (a node's primary, or its CLAUDE.md/AGENTS.md tab) → owning node + path. */
  files = $derived.by(() => {
    const m = new Map<string, { node: TreeNode; path: string }>()
    for (const t of this.tree) {
      m.set(t.path, { node: t, path: t.path })
      if (t.files?.claude) m.set(t.files.claude, { node: t, path: t.files.claude })
      if (t.files?.agents) m.set(t.files.agents, { node: t, path: t.files.agents })
    }
    return m
  })
  labels = $derived(new Map(this.tree.map((t) => [t.path, t.label])))

  async load(root: string): Promise<void> {
    this.loading = true
    this.error = null
    try {
      const q = root ? `?root=${encodeURIComponent(root)}` : ''
      this.tree = await http.get<TreeNode[]>(`/api/claude-tree${q}`)
      this.byId = new Map(this.tree.map((t) => [t.id, t]))
      this.collapsed.clear() // a fresh tree reuses node ids — drop stale collapse state
      this.rebuild()
    } catch (e) {
      this.error = errorMessage(e)
    } finally {
      this.loading = false
    }
  }

  /** Recompute the visible graph from `tree` + `collapsed`, then lay it out. */
  rebuild(): void {
    const g = buildGraph({
      tree: this.tree,
      byId: this.byId,
      collapsed: this.collapsed,
      refsMode: this.refsMode,
      selectedId: this.selected,
    })
    this.nodes = g.nodes
    this.edges = g.edges
  }

  /** In 'selected' mode the visible reference edges depend on the selection, so rebuild;
   *  otherwise just repaint the selected flag. */
  select(id: string | null): void {
    this.selected = id
    if (this.refsMode === 'selected') this.rebuild()
    else this.nodes = this.nodes.map((n) => ({ ...n, selected: n.id === id }))
  }

  cycleRefs(): void {
    this.refsMode = nextRefsMode(this.refsMode)
    this.rebuild()
  }

  toggle(id: string): void {
    if (this.collapsed.has(id)) this.collapsed.delete(id)
    else this.collapsed.add(id)
    this.rebuild()
  }

  hasChildren(id: string): boolean {
    return hasChildren(this.tree, id)
  }

  /** Swap in an updated node (a fresh AGENTS.md tab) so its card badge appears. */
  patch(node: TreeNode): void {
    this.byId.set(node.id, node)
    this.tree = this.tree.map((t) => (t.id === node.id ? node : t))
    this.rebuild()
  }
}
