<script lang="ts">
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  SvelteFlow,
} from '@xyflow/svelte'
import { onMount, setContext, tick } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import '@xyflow/svelte/dist/style.css'
import type { Reference, SearchHit, SearchMatch, TreeNode } from '$lib/claude-tree'
import { type AgentEngine, getAction } from '$lib/claude-tree-actions'
import { type Entity, replaceLines } from '$lib/claude-tree-entities'
import { theme } from '$lib/theme.svelte'
import { CARD_W, cardHeight, layoutTree } from '$lib/tree-layout'
import AgentResultPanel from './AgentResultPanel.svelte'
import CmEditor from './CmEditor.svelte'
import EntityActionMenu from './EntityActionMenu.svelte'
import FocusNode from './FocusNode.svelte'
import TreeNodeCard from './TreeNodeCard.svelte'

const nodeTypes = { claudeCard: TreeNodeCard }

let nodes = $state.raw<Node[]>([])
let edges = $state.raw<Edge[]>([])
// Live viewport — cards read the zoom (via context) to switch to a title-only LOD.
let viewport = $state({ x: 0, y: 0, zoom: 1 })
setContext('atlas-zoom', () => viewport.zoom)
let byId = new Map<string, TreeNode>()
let tree = $state.raw<TreeNode[]>([]) // full scan; nodes/edges are the visible (un-collapsed) subset
const collapsed = new SvelteSet<string>() // node ids whose subtrees are hidden
// Reference edges: show all, only those touching the selected node, or none.
let refsMode = $state<'all' | 'selected' | 'off'>('all')

let root = $state('')
let loading = $state(true)
let error = $state<string | null>(null)

// Theme is global (.dark on <html>, see $lib/theme). The SvelteFlow canvas
// colors are props, not CSS, so they track theme.mode via $derived.
const flowBg = $derived(theme.mode === 'light' ? '#fafafa' : '#0a0a0a')
const flowDot = $derived(theme.mode === 'light' ? '#e4e4e7' : '#26262b')
const miniNode = $derived(theme.mode === 'light' ? '#c4c4cd' : '#2a2a32')
const miniMask = $derived(
  theme.mode === 'light' ? 'rgba(250, 250, 250, 0.72)' : 'rgba(10, 10, 10, 0.7)',
)

// Editor pane state
let current = $state<TreeNode | null>(null)
let activePath = $state('') // the file open in the editor — a node may expose CLAUDE.md + AGENTS.md tabs
let content = $state('')
let diskSha = $state('')
let dirty = $state(false)
let status = $state('')
let history = $state<{ ts: string; sha: string; preview: string }[]>([])
let snapshot = $state('') // selected history index, '' = latest on disk

// Tabs: one per agent-doc file present in the current node's folder (CLAUDE.md / AGENTS.md).
type FileTab = { kind: 'claude' | 'agents'; path: string; name: string }
const tabs = $derived.by<FileTab[]>(() => {
  const f = current?.files
  if (!f) return []
  const out: FileTab[] = []
  if (f.claude) out.push({ kind: 'claude', path: f.claude, name: 'CLAUDE.md' })
  if (f.agents) out.push({ kind: 'agents', path: f.agents, name: 'AGENTS.md' })
  return out
})
const canSync = $derived(!!current?.files?.claude) // CLAUDE.md → AGENTS.md is always available
const activeName = $derived(activePath.slice(activePath.lastIndexOf('/') + 1))
const editingLabel = $derived(
  current ? (activeName ? `${activeName} · ${current.label}` : current.label) : '',
)

// Right-click context menu + copy feedback
let menu = $state<{ x: number; y: number; node: TreeNode } | null>(null)
let toast = $state('')
let toastTimer: ReturnType<typeof setTimeout>

// Find: a scope toggle (Tree = server-side over every file, File = client-side
// over the live editor content) feeding a snippet list that jumps to the line.
let findOpen = $state(false)
let findScope = $state<'tree' | 'file'>('tree')
let findQuery = $state('')
let treeHits = $state.raw<SearchHit[]>([]) // server results for tree scope
let findBusy = $state(false)
let findError = $state<string | null>(null)
let findInput = $state<HTMLInputElement | null>(null)
let cm = $state<{ jumpToLine: (line: number) => void }>() // CmEditor instance, for jump-to-line

// Per-entity agent actions: a hover affordance opens this menu over a heading/bullet,
// the chosen action runs Claude or Codex, and the reply edits the buffer or opens a panel.
let agentEngine = $state<AgentEngine>('claude')
let entityMenu = $state<{ entity: Entity; pos: { x: number; y: number } } | null>(null)
let agentBusy = $state(false)
let agentPanel = $state<{
  title: string
  busy: boolean
  text: string
  error: string | null
} | null>(null)

const pathToNode = $derived(new Map(tree.map((t) => [t.path, t])))

// Any agent-doc file path (a node's primary, or its CLAUDE.md/AGENTS.md tab) → its owning node + path.
const pathToFile = $derived.by(() => {
  const m = new Map<string, { node: TreeNode; path: string }>()
  for (const t of tree) {
    m.set(t.path, { node: t, path: t.path })
    if (t.files?.claude) m.set(t.files.claude, { node: t, path: t.files.claude })
    if (t.files?.agents) m.set(t.files.agents, { node: t, path: t.files.agents })
  }
  return m
})

const SNIPPET_MAX = 200 // mirror of the server window, so File scope matches Tree scope

/** Client mirror of the server `matchLines` — windows long lines around the match. */
function matchLines(text: string, q: string): SearchMatch[] {
  const matches: SearchMatch[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length && matches.length < 50; i++) {
    const col = lines[i].toLowerCase().indexOf(q)
    if (col < 0) continue
    matches.push({ line: i + 1, ...windowLine(lines[i], col) })
  }
  return matches
}

function windowLine(line: string, col: number): { text: string; col: number } {
  if (line.length <= SNIPPET_MAX) return { text: line, col }
  const start = Math.max(0, col - Math.floor(SNIPPET_MAX / 2))
  const prefix = start > 0 ? '…' : ''
  return { text: prefix + line.slice(start, start + SNIPPET_MAX), col: col - start + prefix.length }
}

// File scope searches the live (possibly unsaved) editor content, client-side.
const fileHit = $derived.by<SearchHit | null>(() => {
  const q = findQuery.trim().toLowerCase()
  if (!current || !activePath || !q) return null
  const matches = matchLines(content, q)
  return matches.length ? { path: activePath, matches } : null
})
const hits = $derived<SearchHit[]>(findScope === 'file' ? (fileHit ? [fileHit] : []) : treeHits)
const hitCount = $derived(hits.reduce((n, h) => n + h.matches.length, 0))
const queryLen = $derived(findQuery.trim().length) // highlight span on each snippet

onMount(() => {
  root = new URL(location.href).searchParams.get('root') ?? ''
  void loadTree()

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      menu = null
      findOpen = false
      entityMenu = null
      agentPanel = null
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      void save()
    }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault()
      void openFind()
    }
  }
  const onUnload = (e: BeforeUnloadEvent) => {
    if (dirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  // Close the context / entity menu on any click outside it (no full-screen backdrop).
  // The ✦ affordance lives in the editor, so its click must not self-close the menu it opens.
  const onClick = (e: MouseEvent) => {
    const t = e.target as Element | null
    if (menu && !t?.closest('.ctxmenu')) menu = null
    if (
      entityMenu &&
      !agentBusy &&
      !t?.closest('.entity-menu') &&
      !t?.closest('.cm-entity-action') &&
      !t?.closest('.ed-ai')
    )
      entityMenu = null
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('beforeunload', onUnload)
  window.addEventListener('click', onClick)
  return () => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('beforeunload', onUnload)
    window.removeEventListener('click', onClick)
  }
})

// Tree scope hits the server (debounced). File scope is purely derived, no fetch.
$effect(() => {
  const q = findQuery.trim()
  if (!findOpen || findScope !== 'tree' || !q) {
    treeHits = []
    findBusy = false
    findError = null
    return
  }
  findBusy = true
  const timer = setTimeout(() => void runTreeSearch(q), 200)
  return () => clearTimeout(timer)
})

async function runTreeSearch(q: string) {
  const url = `/api/claude-tree?search=${encodeURIComponent(q)}${root ? `&root=${encodeURIComponent(root)}` : ''}`
  try {
    treeHits = await api<SearchHit[]>(url)
    findError = null
  } catch (e) {
    treeHits = []
    findError = (e as Error).message
  } finally {
    findBusy = false
  }
}

async function api<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts)
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error ?? r.statusText)
  return data as T
}

async function loadTree() {
  loading = true
  error = null
  try {
    const q = root ? `?root=${encodeURIComponent(root)}` : ''
    tree = await api<TreeNode[]>(`/api/claude-tree${q}`)
    byId = new Map(tree.map((t) => [t.id, t]))
    collapsed.clear() // a fresh tree reuses node ids — drop stale collapse state
    rebuild()
    // Editor starts closed — it opens only when a node is clicked.
  } catch (e) {
    error = (e as Error).message
  } finally {
    loading = false
  }
}

/** A node is hidden when any ancestor up its chain is collapsed. */
function isVisible(t: TreeNode): boolean {
  let p = t.parent
  while (p) {
    if (collapsed.has(p)) return false
    p = byId.get(p)?.parent ?? null
  }
  return true
}

function descendantCount(id: string): number {
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

const hasChildren = (id: string): boolean => tree.some((t) => t.parent === id)

/** Distinct other-node targets this node references (drives the card badge). */
function refCountOf(t: TreeNode): number {
  const ids = (t.references ?? [])
    .filter((r) => r.targetId && r.targetId !== t.id)
    .map((r) => r.targetId)
  return new Set(ids).size
}

const toCardNode = (t: TreeNode): Node => ({
  id: t.id,
  type: 'claudeCard',
  position: { x: 0, y: 0 },
  selected: current?.id === t.id,
  data: {
    label: t.label,
    kind: t.kind,
    preview: t.preview,
    tokensAccumulated: t.tokensAccumulated,
    collapsed: collapsed.has(t.id),
    hidden: collapsed.has(t.id) ? descendantCount(t.id) : 0,
    hasAgents: !!t.files?.agents,
    globs: t.preview.globs,
    refs: refCountOf(t),
    height: cardHeight(t.preview), // layout height — compact LOD reuses it for a same-size card
  },
})

/** Recompute the visible graph from `tree` + `collapsed`, then lay it out. */
function rebuild() {
  const vis = tree.filter(isVisible)
  const visibleIds = new Set(vis.map((t) => t.id))
  // Rules are not part of the hierarchy — they hang off the side of their owning
  // CLAUDE.md. Lay out only the hierarchy with dagre, then place rules as sidecars.
  const treeVis = vis.filter((t) => t.kind !== 'rule')
  const ruleVis = vis.filter((t) => t.kind === 'rule')

  // Tree edges (parent → child) flow vertically (bottom → top handles) and drive the layout.
  const treeEdges: Edge[] = treeVis
    .filter((t) => t.parent && visibleIds.has(t.parent))
    .map((t) => ({
      id: `${t.parent}->${t.id}`,
      source: t.parent as string,
      target: t.id,
      sourceHandle: 'b',
      targetHandle: 't',
      type: 'smoothstep',
    }))
  const laidTree = layoutTree(treeVis.map(toCardNode), treeEdges)
  const posById = new Map(laidTree.map((n) => [n.id, n.position]))

  // Rule sidecars: sit to the RIGHT of their owning node, stacked if several, joined
  // by a distinct dashed rule-colored edge (right → left handles).
  const RULE_GAP_X = 80
  const RULE_GAP_Y = 24
  const perParent = new Map<string, number>()
  const ruleNodes: Node[] = []
  const ruleEdges: Edge[] = []
  const ruleConnected = new Set<string>()
  for (const r of ruleVis) {
    const n = toCardNode(r)
    const base = r.parent ? posById.get(r.parent) : undefined
    const idx = r.parent ? (perParent.get(r.parent) ?? 0) : 0
    if (r.parent) perParent.set(r.parent, idx + 1)
    n.position = {
      x: (base?.x ?? 0) + CARD_W + RULE_GAP_X,
      y: (base?.y ?? 0) + idx * (cardHeight(r.preview) + RULE_GAP_Y),
    }
    ruleNodes.push(n)
    if (r.parent && visibleIds.has(r.parent)) {
      ruleEdges.push({
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
      ruleConnected.add(`${r.parent}->${r.id}`)
    }
  }

  // Reference edges flow horizontally (right → left handles), straight + animated,
  // and overlay on top. Honor refsMode: all / only-selected / off.
  const sel = current?.id
  const seen = new Set<string>()
  const refEdges: Edge[] = []
  if (refsMode !== 'off') {
    for (const t of vis) {
      for (const r of t.references ?? []) {
        if (!r.targetId || r.targetId === t.id || !visibleIds.has(r.targetId)) continue
        if (refsMode === 'selected' && t.id !== sel && r.targetId !== sel) continue
        if (ruleConnected.has(`${t.id}->${r.targetId}`)) continue // rule sidecar edge covers it
        const id = `ref:${t.id}->${r.targetId}`
        if (seen.has(id)) continue
        seen.add(id)
        refEdges.push({
          id,
          source: t.id,
          target: r.targetId,
          sourceHandle: 'r',
          targetHandle: 'l',
          type: 'straight',
          animated: true,
          data: { kind: 'reference' },
          style: 'stroke: var(--accent); stroke-width: 1.5px; opacity: 0.85;',
        })
      }
    }
  }
  nodes = [...laidTree, ...ruleNodes]
  edges = [...treeEdges, ...ruleEdges, ...refEdges]
}

/** Cycle reference-edge visibility: all → only-selected → off → all. */
function cycleRefsMode() {
  refsMode = refsMode === 'all' ? 'selected' : refsMode === 'selected' ? 'off' : 'all'
  rebuild()
}

function toggleCollapse(node: TreeNode) {
  menu = null
  if (collapsed.has(node.id)) collapsed.delete(node.id)
  else collapsed.add(node.id)
  rebuild()
}

function markSelected(id: string) {
  nodes = nodes.map((n) => ({ ...n, selected: n.id === id }))
}

function closeEditor() {
  if (dirty && current && !confirm(`Discard unsaved changes to ${editingLabel}?`)) return
  current = null
  activePath = ''
  dirty = false
  if (refsMode === 'selected') rebuild()
  else nodes = nodes.map((n) => ({ ...n, selected: false }))
}

function openMenu(event: MouseEvent, nodeId: string) {
  event.preventDefault()
  const node = byId.get(nodeId)
  if (!node) return
  menu = { x: Math.min(event.clientX, window.innerWidth - 220), y: event.clientY, node }
}

function showToast(msg: string) {
  toast = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast = ''), 1800)
}

async function fetchContent(node: TreeNode): Promise<string> {
  const r = await api<{ content: string; sha: string }>(
    `/api/claude-tree?path=${encodeURIComponent(node.path)}`,
  )
  return r.content
}

/** The node plus its ancestor chain, ordered root → … → node (load order). */
function ancestorChain(node: TreeNode): TreeNode[] {
  const chain: TreeNode[] = []
  let cur: TreeNode | undefined = node
  while (cur) {
    chain.unshift(cur)
    cur = cur.parent ? byId.get(cur.parent) : undefined
  }
  return chain
}

async function copyText(text: string, label: string) {
  menu = null
  try {
    await navigator.clipboard.writeText(text)
    showToast(label)
  } catch (e) {
    showToast(`copy failed: ${(e as Error).message}`)
  }
}

async function copyContents(node: TreeNode) {
  await copyText(await fetchContent(node), `Copied ${node.label}`)
}

async function copyWithAncestors(node: TreeNode) {
  const chain = ancestorChain(node)
  const parts = await Promise.all(
    chain.map(async (n) => `# ===== ${n.label} =====\n# ${n.path}\n\n${await fetchContent(n)}`),
  )
  const n = chain.length - 1
  await copyText(parts.join('\n\n\n'), `Copied ${node.label} + ${n} ancestor${n === 1 ? '' : 's'}`)
}

/** The folder containing a node's CLAUDE.md (strip the trailing `/CLAUDE.md`). */
function folderOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i > 0 ? path.slice(0, i) : path
}

/** Re-root the tree at this node's folder — ancestors above, descendants below, refetched. */
async function navigateTo(node: TreeNode) {
  menu = null
  if (dirty && current && !confirm(`Discard unsaved changes to ${editingLabel}?`)) return
  root = folderOf(node.path)
  const url = new URL(location.href)
  url.searchParams.set('root', root)
  window.history.replaceState(null, '', url)
  current = null
  activePath = ''
  dirty = false
  await loadTree()
}

/** Open a specific file (a node's primary, or one of its CLAUDE.md/AGENTS.md tabs) in the editor. */
async function openFile(node: TreeNode, path: string, skipGuard = false) {
  const switching = node.id !== current?.id || path !== activePath
  if (!skipGuard && dirty && switching && !confirm(`Discard unsaved changes to ${editingLabel}?`)) {
    return
  }
  current = node
  activePath = path
  // In 'selected' mode the visible reference edges depend on the selection, so rebuild;
  // otherwise just repaint the selected flag.
  if (refsMode === 'selected') rebuild()
  else markSelected(node.id)
  status = 'loading…'
  snapshot = ''
  try {
    const r = await api<{ content: string; sha: string }>(
      `/api/claude-tree?path=${encodeURIComponent(path)}`,
    )
    content = r.content
    diskSha = r.sha
    dirty = false
    status = `sha ${r.sha}`
    await loadHistory()
  } catch (e) {
    status = `error: ${(e as Error).message}`
  }
}

async function selectNode(id: string, skipGuard = false) {
  const tn = byId.get(id)
  if (!tn) return
  await openFile(tn, tn.path, skipGuard)
}

async function loadHistory() {
  if (!current) return
  history = await api(`/api/claude-tree?history=${encodeURIComponent(activePath)}`)
}

async function postOp<T = { ok: boolean; sha: string }>(body: Record<string, unknown>): Promise<T> {
  return api<T>('/api/claude-tree', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function save() {
  if (!current || !dirty) return
  try {
    const r = await postOp({ op: 'save', path: activePath, content, expectedSha: diskSha })
    diskSha = r.sha
    dirty = false
    status = `saved · sha ${r.sha}`
    await loadHistory()
  } catch (e) {
    const msg = (e as Error).message
    if (msg === 'disk changed' && confirm('File changed on disk. Overwrite anyway?')) {
      const r = await postOp({ op: 'save', path: activePath, content, force: true })
      diskSha = r.sha
      dirty = false
      status = `saved · sha ${r.sha}`
      await loadHistory()
    } else {
      status = `save failed: ${msg}`
    }
  }
}

async function revert() {
  if (!current) return
  if (!confirm(`Revert ${editingLabel} to last snapshot?`)) return
  try {
    await postOp({ op: 'revert', path: activePath })
    await openFile(current, activePath, true)
  } catch (e) {
    status = `revert failed: ${(e as Error).message}`
  }
}

/** Copy this folder's CLAUDE.md into its sibling AGENTS.md (creating it if missing). */
async function syncToAgents() {
  const claudePath = current?.files?.claude
  if (!current || !claudePath) return
  if (dirty && activePath === claudePath) await save()
  try {
    const r = await postOp<{ ok: boolean; sha: string; path: string }>({
      op: 'sync',
      path: claudePath,
    })
    patchAgents(r.path)
    if (current && activePath === r.path) await openFile(current, r.path, true)
    showToast('Synced CLAUDE.md → AGENTS.md')
  } catch (e) {
    status = `sync failed: ${(e as Error).message}`
  }
}

/** Reflect a freshly-created AGENTS.md on the current node so its tab + card badge appear. */
function patchAgents(agentsPath: string) {
  if (!current) return
  const updated: TreeNode = { ...current, files: { ...current.files, agents: agentsPath } }
  current = updated
  byId.set(updated.id, updated)
  tree = tree.map((t) => (t.id === updated.id ? updated : t))
  rebuild()
}

async function previewSnapshot() {
  if (!current) return
  if (snapshot === '') {
    await openFile(current, activePath, true)
    return
  }
  const r = await api<{ content: string }>(
    `/api/claude-tree?snapshot=${encodeURIComponent(activePath)}&n=${snapshot}`,
  )
  content = r.content
  dirty = true
  status = `previewing snapshot #${snapshot} (unsaved)`
}

async function openFind() {
  findOpen = true
  await tick()
  findInput?.focus()
  findInput?.select()
}

/** Open the hit's file in the editor (honoring the dirty guard) and jump to the line. */
async function openHit(path: string, line: number) {
  const ref = pathToFile.get(path)
  if (!ref) return
  if (current?.id !== ref.node.id || activePath !== ref.path) await openFile(ref.node, ref.path)
  await tick()
  jumpToLine(line)
}

function jumpToLine(line: number) {
  cm?.jumpToLine(line)
}

// References parsed from the active file (the node's primary), deduped for the chip strip.
const refIcons: Record<Reference['kind'], string> = {
  link: '↗',
  import: '@',
  wikilink: '⟦⟧',
  'code-path': '/',
}
const currentRefs = $derived.by<Reference[]>(() => {
  if (!current?.references || activePath !== current.path) return []
  const seen = new Set<string>()
  const out: Reference[] = []
  for (const r of current.references) {
    const key = r.targetPath ?? r.rawPath
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
})

// Every reference occurrence on the active primary file — for inline link decorations
// in the editor (the chip strip dedups; inline keeps each occurrence on its own line).
const inlineRefs = $derived(
  current && activePath === current.path ? (current.references ?? []) : [],
)

/** Open an arbitrary catalog file (a referenced non-node file) in the editor via a throwaway node. */
async function openPath(path: string) {
  const synthetic: TreeNode = {
    id: 'ext:' + path,
    path,
    label: path.slice(path.lastIndexOf('/') + 1),
    kind: 'descendant',
    parent: null,
    preview: { h1: '', blurb: '', sections: [], lines: 0, tokens: 0 },
    tokensAccumulated: 0,
  }
  await openFile(synthetic, path)
}

/** Follow a reference: select its node when it is one, else open the file it points at. */
async function openReference(ref: Reference) {
  if (ref.targetId) {
    const node = byId.get(ref.targetId)
    if (node) return openFile(node, ref.targetPath ?? node.path)
  }
  if (ref.targetPath) await openPath(ref.targetPath)
}

/** A hover affordance was clicked in the editor — open the action menu over that entity. */
function openEntityMenu(entity: Entity, pos: { x: number; y: number }) {
  agentPanel = null
  entityMenu = { entity, pos }
}

/** The whole active file as one entity — backs the file-level AI button in the header. */
function openFileMenu(event: MouseEvent) {
  if (!current) return
  event.stopPropagation() // don't let the global close-on-outside-click see this click
  agentPanel = null
  const lineCount = content.split('\n').length
  const entity: Entity = {
    id: 'file',
    kind: 'file',
    anchorLine: 1,
    startLine: 1,
    endLine: lineCount,
    level: 0,
    title: activeName || current.label,
    text: content,
  }
  const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
  entityMenu = { entity, pos: { x: r.left, y: r.bottom + 4 } }
}

type AgentResult = { kind: 'edit' | 'answer'; text: string; engine: AgentEngine }

/** Run the chosen action against the current buffer; edits splice in, answers open the panel. */
async function runEntityAction(p: { actionId: string; locked: boolean; question?: string }) {
  if (!current || !entityMenu) return
  const action = getAction(p.actionId)
  if (!action) return
  const entity = entityMenu.entity
  const label = `${action.label} · ${entity.title}`
  agentBusy = true
  if (action.mode === 'answer') {
    agentPanel = { title: label, busy: true, text: '', error: null }
    entityMenu = null
  }
  try {
    const res = await api<AgentResult>('/api/claude-tree/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: activePath,
        content,
        engine: agentEngine,
        actionId: p.actionId,
        locked: p.locked,
        question: p.question,
        entity: {
          text: entity.text,
          startLine: entity.startLine,
          endLine: entity.endLine,
          kind: entity.kind,
        },
      }),
    })
    if (res.kind === 'answer')
      agentPanel = { title: label, busy: false, text: res.text, error: null }
    else applyAgentEdit(entity, res, p.locked, action.label)
  } catch (e) {
    const msg = (e as Error).message
    if (action.mode === 'answer') agentPanel = { title: label, busy: false, text: '', error: msg }
    else showToast(`Agent failed: ${msg}`)
    status = `agent failed: ${msg}`
  } finally {
    agentBusy = false
  }
}

/** Apply an edit result: replace just the item (locked) or the whole file (free), then mark dirty. */
function applyAgentEdit(entity: Entity, res: AgentResult, locked: boolean, label: string) {
  content = locked ? replaceLines(content, entity.startLine, entity.endLine, res.text) : res.text
  dirty = true
  status = `${label} via ${res.engine} · unsaved`
  entityMenu = null
  showToast(`${label} applied — review & Save`)
}
</script>

<svelte:head>
  <title>Atlas - Claude Tree</title>
</svelte:head>

<div class="page">
	<header class="topbar">
		<h1>CLAUDE.md tree</h1>
		<span class="proj">{root || '~/dev'}</span>
		<span class="hint">Click a node · <kbd>⌘/Ctrl-S</kbd> save · <kbd>⌘/Ctrl-F</kbd> find</span>
		<button
			class="theme-toggle"
			class:active={refsMode !== 'off'}
			title={'Reference links: ' +
				(refsMode === 'all' ? 'all' : refsMode === 'selected' ? 'selected node only' : 'hidden') +
				' (click to cycle)'}
			aria-label="Toggle reference links"
			onclick={cycleRefsMode}
		>
			{refsMode === 'all' ? '⇄' : refsMode === 'selected' ? '◎' : '⊘'}
		</button>
		<button
			class="theme-toggle"
			class:active={findOpen}
			title="Find in tree (⌘/Ctrl-F)"
			aria-label="Find in tree"
			onclick={openFind}
		>
			⌕
		</button>
	</header>

	<div class="split">
		<aside class="graphpane" class:full={!current}>
			{#if loading}
				<div class="state">Scanning…</div>
			{:else if error}
				<div class="state err">{error}</div>
			{:else}
				<SvelteFlow
					bind:nodes
					bind:edges
					bind:viewport
					{nodeTypes}
					fitView
					fitViewOptions={{ minZoom: 1, maxZoom: 1, padding: 0.12 }}
					minZoom={0.2}
					maxZoom={2}
					nodesDraggable={false}
					onnodeclick={({ node }) => selectNode(node.id)}
					onnodecontextmenu={({ event, node }) => openMenu(event as MouseEvent, node.id)}
				>
					<Background variant={BackgroundVariant.Dots} gap={22} size={1} bgColor={flowBg} patternColor={flowDot} />
					<Controls showLock={false} />
					<MiniMap pannable zoomable nodeColor={miniNode} maskColor={miniMask} />
					<FocusNode focusId={current?.id ?? null} />
				</SvelteFlow>
			{/if}

			{#if findOpen}
				<div class="findpanel">
					<div class="findscope">
						<button class:on={findScope === 'tree'} onclick={() => (findScope = 'tree')}>Tree</button>
						<button
							class:on={findScope === 'file'}
							disabled={!current}
							title={current ? 'Search the open file' : 'Open a file to search it'}
							onclick={() => (findScope = 'file')}>File</button
						>
						<span class="findspacer"></span>
						<button
							class="findclose"
							title="Close (Esc)"
							aria-label="Close find"
							onclick={() => (findOpen = false)}>✕</button
						>
					</div>
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="findinput"
						bind:this={findInput}
						bind:value={findQuery}
						placeholder={findScope === 'file' ? 'Find in file…' : 'Find in tree…'}
						spellcheck="false"
						autofocus
					/>
					<div class="findmeta">
						{#if findBusy}
							searching…
						{:else if findError}
							<span class="err">{findError}</span>
						{:else if findQuery.trim()}
							{hitCount} match{hitCount === 1 ? '' : 'es'} · {hits.length} file{hits.length === 1
								? ''
								: 's'}
						{/if}
					</div>
					<div class="findlist">
						{#each hits as hit (hit.path)}
							{@const node = pathToNode.get(hit.path)}
							<div class="findfile">
								<span class="findfile-label">{node?.label ?? hit.path}</span>
								<span class="findfile-path">{hit.path}</span>
							</div>
							{#each hit.matches as m (m.line + ':' + m.col)}
								<button class="findhit" onclick={() => openHit(hit.path, m.line)}>
									<span class="findln">{m.line}</span>
									<span class="findsnip"
										>{m.text.slice(0, m.col)}<mark>{m.text.slice(m.col, m.col + queryLen)}</mark
										>{m.text.slice(m.col + queryLen)}</span
									>
								</button>
							{/each}
						{/each}
						{#if findQuery.trim() && !findBusy && !findError && hits.length === 0}
							<div class="findempty">No matches</div>
						{/if}
					</div>
				</div>
			{/if}
		</aside>

		{#if current}
			<main class="editorpane">
				<header class="ed-head">
					<button class="ed-close" title="Close editor" onclick={closeEditor}>✕</button>
					{#if tabs.length > 1}
						<div class="ed-tabs" role="tablist">
							{#each tabs as t (t.kind)}
								<button
									class="ed-tab"
									class:on={activePath === t.path}
									role="tab"
									aria-selected={activePath === t.path}
									onclick={() => openFile(current!, t.path)}>{t.name}</button
								>
							{/each}
						</div>
					{:else}
						<code class="ed-label">{current.label}</code>
					{/if}
					<span class="ed-path">{activePath}</span>
					<button
						class="ed-ai"
						title="AI actions for the whole file"
						aria-label="AI actions for the whole file"
						onclick={openFileMenu}
					>
						<span class="ed-ai-glyph">✦</span> AI
					</button>
					<span class="badge" class:dirty>{status}</span>
				</header>
				{#if currentRefs.length}
					<div class="ed-refs">
						<span class="ed-refs-label">refs</span>
						{#each currentRefs as r (r.kind + r.rawPath + r.line)}
							<button
								class="refchip"
								class:node={!!r.targetId}
								disabled={!r.targetPath}
								title={r.targetPath ?? `${r.rawPath} (unresolved)`}
								onclick={() => openReference(r)}
							>
								<span class="refchip-kind">{refIcons[r.kind]}</span>
								<span class="refchip-label">{r.label}</span>
							</button>
						{/each}
					</div>
				{/if}
				<CmEditor
					bind:this={cm}
					value={content}
					references={inlineRefs}
					dark={theme.mode === 'dark'}
					activeRange={entityMenu
						? { startLine: entityMenu.entity.startLine, endLine: entityMenu.entity.endLine }
						: null}
					onChange={(v) => {
						content = v;
						dirty = true;
						status = 'unsaved';
					}}
					onRefClick={openReference}
					onEntityAction={openEntityMenu}
				/>
				<footer class="ed-foot">
					<button class="primary" onclick={save} disabled={!dirty}>Save</button>
					<button onclick={revert} disabled={history.length === 0}>Revert</button>
					{#if canSync}
						<button
							class="sync"
							onclick={syncToAgents}
							title="Copy CLAUDE.md → AGENTS.md (creates AGENTS.md if missing)">Sync → AGENTS.md</button
						>
					{/if}
					<span class="spacer"></span>
					<label>
						History
						<select bind:value={snapshot} onchange={previewSnapshot}>
							<option value="">(latest)</option>
							{#each history as h, i (h.ts + h.sha)}
								<option value={String(i)}>{h.ts} · {h.sha}</option>
							{/each}
						</select>
					</label>
				</footer>
			</main>
		{/if}
	</div>
</div>

{#if menu}
	{@const node = menu.node}
	<div class="ctxmenu" style="left: {menu.x}px; top: {menu.y}px;">
		<div class="ctxhead">{node.label}</div>
		{#if folderOf(node.path) !== root}
			<button onclick={() => navigateTo(node)}>Re-root tree here ↻</button>
		{/if}
		{#if hasChildren(node.id)}
			<button onclick={() => toggleCollapse(node)}>
				{collapsed.has(node.id) ? 'Expand branch' : 'Collapse branch'}
			</button>
		{/if}
		{#if folderOf(node.path) !== root || hasChildren(node.id)}
			<div class="ctxsep"></div>
		{/if}
		<button onclick={() => copyContents(node)}>Copy contents</button>
		<button onclick={() => copyWithAncestors(node)}>Copy with ancestors</button>
	</div>
{/if}

{#if entityMenu}
	<EntityActionMenu
		entity={entityMenu.entity}
		pos={entityMenu.pos}
		engine={agentEngine}
		busy={agentBusy}
		onRun={runEntityAction}
		onEngineChange={(e) => (agentEngine = e)}
		onClose={() => (entityMenu = null)}
	/>
{/if}

{#if agentPanel}
	<AgentResultPanel
		title={agentPanel.title}
		engine={agentEngine}
		busy={agentPanel.busy}
		text={agentPanel.text}
		error={agentPanel.error}
		onClose={() => (agentPanel = null)}
	/>
{/if}

{#if toast}
	<div class="toast">{toast}</div>
{/if}

<style>
	/* Local names mapped onto the global design tokens — the theme flips via
	   `.dark` on <html> (see $lib/styles/tokens.css), so no per-page override block. */
	.page {
		--bg: var(--color-bg);
		--surface: var(--color-bg-elev);
		--surface-2: var(--color-card);
		--control: var(--color-card-2);
		--control-hover: var(--color-hover);
		--border: var(--color-border);
		--border-soft: var(--color-border-soft);
		--border-faint: var(--color-border-soft);
		--edge: var(--color-border-strong);
		--text: var(--color-fg);
		--text-dim: var(--color-fg-2);
		--text-dimmer: var(--color-muted);
		--text-faint: var(--color-muted-2);
		--accent: var(--color-accent);
		--accent-text: var(--color-accent-soft-fg);
		--accent-bg: var(--color-accent-soft);
		--accent-bg-strong: var(--color-accent-soft);
		--accent-bg-hover: var(--color-accent-soft);
		--danger: var(--color-neg);
		--danger-bg: var(--color-neg-soft);
		--shadow: var(--color-overlay);
		--card-bg: var(--color-card);
		--card-head: var(--color-card-2);
		--card-view: var(--color-bg);
		--card-muted: var(--color-muted);

		height: calc(100vh - var(--nav-h));
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--text);
	}
	.topbar {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.55rem 1rem;
		background: var(--surface);
	}
	/* Fade-out divider — rules never quite touch the surface edges. */
	.topbar::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: var(--hairline);
		background: var(--grad-divider);
	}
	.topbar h1 {
		font-size: 0.92rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.topbar h1::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: var(--radius-xs);
		background: var(--accent);
		transform: rotate(45deg);
	}
	.topbar .proj {
		color: var(--text-dimmer);
		font: 400 0.72rem/1 var(--font-mono);
		overflow-wrap: anywhere;
	}
	.topbar .hint {
		color: var(--text-faint);
		font-size: 0.72rem;
		margin-left: auto;
	}
	.topbar kbd {
		font: 500 0.68rem var(--font-mono);
		background: var(--control);
		border: var(--hairline) solid var(--border);
		border-radius: var(--radius-xs);
		padding: 1px 5px;
		color: var(--text-dim);
	}
	.theme-toggle {
		padding: 0.28rem 0.5rem;
		font-size: 0.85rem;
		line-height: 1;
	}
	.theme-toggle.active {
		border-color: var(--accent);
		background: var(--accent-bg-strong);
		color: var(--accent-text);
	}
	.split {
		flex: 1;
		display: flex;
		min-height: 0;
	}
	.graphpane {
		flex: 0 0 40%;
		min-width: 280px;
		max-width: 70%;
		overflow: hidden;
		resize: horizontal;
		border-right: var(--hairline) solid var(--border);
		position: relative;
	}
	/* editor closed → graph takes the whole width */
	.graphpane.full {
		flex: 1 1 auto;
		max-width: none;
		resize: none;
		border-right: 0;
	}
	.graphpane :global(.svelte-flow) {
		width: 100%;
		height: 100%;
		background: var(--bg);
	}
	.graphpane :global(.svelte-flow__edge-path) {
		stroke: var(--edge);
		stroke-width: 1.5;
	}
	.graphpane :global(.svelte-flow__controls-button) {
		background: var(--control);
		border-bottom: var(--hairline) solid var(--border);
		fill: var(--text-dim);
	}
	.graphpane :global(.svelte-flow__controls-button:hover) {
		background: var(--control-hover);
	}
	.graphpane :global(.svelte-flow__attribution) {
		background: transparent;
		color: var(--text-faint);
	}
	.state {
		padding: 2rem;
		color: var(--text-dimmer);
		font-size: 0.85rem;
	}
	.state.err {
		color: var(--danger);
		font-family: var(--font-mono);
	}
	.editorpane {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--surface-2);
	}
	.ed-close {
		flex: none;
		padding: 0 0.45rem;
		border: 0;
		background: transparent;
		color: var(--text-dimmer);
		font-size: 0.78rem;
		line-height: 1;
		cursor: pointer;
		align-self: center;
	}
	.ed-close:hover {
		color: var(--text);
	}
	.ed-head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.7rem 1rem;
		border-bottom: var(--hairline) solid var(--border-soft);
		flex-wrap: wrap;
	}
	.ed-label {
		font: 600 0.9rem var(--font-sans);
		letter-spacing: -0.01em;
	}
	.ed-tabs {
		display: flex;
		gap: 0.25rem;
		align-self: center;
	}
	.ed-tab {
		padding: 0.22rem 0.6rem;
		font: 600 0.72rem var(--font-mono);
		border-radius: var(--radius-sm);
		color: var(--text-dim);
	}
	.ed-tab.on {
		border-color: var(--accent);
		background: var(--accent-bg-strong);
		color: var(--accent-text);
	}
	button.sync {
		border-color: var(--accent);
		color: var(--accent-text);
		background: transparent;
	}
	button.sync:hover:not(:disabled) {
		background: var(--accent-bg);
	}
	.ed-path {
		color: var(--text-faint);
		font: 400 0.7rem var(--font-mono);
		overflow-wrap: anywhere;
		flex: 1 1 auto;
	}
	.ed-ai {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: var(--hairline) solid var(--accent);
		background: var(--accent-bg);
		color: var(--accent);
		border-radius: var(--radius-full);
		padding: 2px 11px;
		font: 600 0.72rem var(--font-mono);
		cursor: pointer;
		white-space: nowrap;
	}
	.ed-ai:hover {
		background: var(--accent-bg-hover);
	}
	.ed-ai-glyph {
		font-size: 0.9rem;
		line-height: 1;
	}
	.badge {
		font: 500 0.66rem var(--font-mono);
		padding: 2px 8px;
		border-radius: var(--radius-full);
		background: var(--accent-bg);
		color: var(--accent);
		white-space: nowrap;
	}
	.badge.dirty {
		background: var(--danger-bg);
		color: var(--danger);
	}
	.ed-foot {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		padding: 0.6rem 1rem;
		border-top: var(--hairline) solid var(--border-soft);
		font-size: 0.76rem;
		background: var(--surface);
	}
	.ed-foot .spacer {
		flex: 1;
	}
	.ed-foot label {
		color: var(--text-dim);
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	button {
		font: 500 0.76rem var(--font-sans);
		padding: 0.36rem 0.85rem;
		border-radius: var(--radius-sm);
		border: var(--hairline) solid var(--border);
		background: var(--control);
		color: var(--text);
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		background: var(--control-hover);
		border-color: var(--edge);
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	button.primary {
		border-color: var(--accent);
		background: var(--accent-bg-strong);
		color: var(--accent-text);
	}
	button.primary:hover:not(:disabled) {
		background: var(--accent-bg-hover);
	}
	select {
		font: 500 0.72rem var(--font-mono);
		padding: 0.3rem 0.45rem;
		border-radius: var(--radius-sm);
		border: var(--hairline) solid var(--border);
		background: var(--control);
		color: var(--text);
	}

	/* right-click context menu */
	/* ctxmenu + toast render outside .page, so they read the GLOBAL design tokens
	   directly (the page-local --aliases don't cascade out here). */
	.ctxmenu {
		position: fixed;
		z-index: 1000;
		min-width: 200px;
		background: var(--color-bg-elev);
		border: var(--hairline) solid var(--color-border);
		border-radius: var(--radius-md);
		padding: 4px;
		box-shadow: var(--shadow-lg);
	}
	.ctxhead {
		padding: 5px 8px 6px;
		font: 400 0.66rem var(--font-mono);
		color: var(--color-muted);
		border-bottom: var(--hairline) solid var(--color-border-soft);
		margin-bottom: 4px;
		overflow-wrap: anywhere;
	}
	.ctxmenu button {
		display: block;
		width: 100%;
		text-align: left;
		border: 0;
		background: transparent;
		border-radius: var(--radius-sm);
		padding: 0.4rem 0.5rem;
		color: var(--color-fg);
		font: 500 0.76rem var(--font-sans);
		cursor: pointer;
	}
	.ctxmenu button:hover {
		background: var(--color-hover);
	}
	.ctxsep {
		height: 1px;
		margin: 4px 2px;
		background: var(--color-border-soft);
	}
	.toast {
		position: fixed;
		bottom: 1.1rem;
		right: 1.1rem;
		z-index: 1001;
		background: var(--color-bg-elev);
		border: var(--hairline) solid var(--color-border);
		color: var(--color-fg);
		padding: 0.55rem 0.85rem;
		border-radius: var(--radius-md);
		font: 500 0.78rem var(--font-sans);
		box-shadow: var(--shadow-lg);
	}

	/* find panel — overlays the top-left of the graph pane */
	.findpanel {
		position: absolute;
		top: 0.6rem;
		left: 0.6rem;
		z-index: 20;
		width: 18rem;
		max-width: calc(100% - 1.2rem);
		display: flex;
		flex-direction: column;
		max-height: calc(100% - 1.2rem);
		background: var(--surface);
		border: var(--hairline) solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 30px var(--shadow);
		overflow: hidden;
	}
	.findscope {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.45rem 0.5rem 0.4rem;
		border-bottom: var(--hairline) solid var(--border-soft);
	}
	.findscope button {
		padding: 0.22rem 0.6rem;
		font: 600 0.7rem var(--font-sans);
		border-radius: var(--radius-sm);
	}
	.findscope button.on {
		border-color: var(--accent);
		background: var(--accent-bg-strong);
		color: var(--accent-text);
	}
	.findspacer {
		flex: 1;
	}
	.findscope .findclose {
		padding: 0.22rem 0.45rem;
		color: var(--text-dimmer);
		border-color: transparent;
		background: transparent;
	}
	.findscope .findclose:hover {
		color: var(--text);
	}
	.findinput {
		margin: 0.5rem 0.5rem 0;
		padding: 0.4rem 0.55rem;
		font: 400 0.78rem var(--font-mono);
		border: var(--hairline) solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--control);
		color: var(--text);
		outline: 0;
	}
	.findinput:focus {
		border-color: var(--accent);
	}
	.findmeta {
		padding: 0.35rem 0.6rem 0.25rem;
		font: 400 0.66rem var(--font-mono);
		color: var(--text-dimmer);
		min-height: 1rem;
	}
	.findmeta .err {
		color: var(--danger);
	}
	.findlist {
		overflow-y: auto;
		padding: 0 0.35rem 0.4rem;
	}
	.findfile {
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 0.4rem 0.4rem 0.15rem;
		margin-top: 0.2rem;
	}
	.findfile-label {
		font: 600 0.72rem var(--font-sans);
		color: var(--text);
	}
	.findfile-path {
		font: 400 0.6rem var(--font-mono);
		color: var(--text-faint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		direction: rtl; /* keep the filename end visible when truncated */
		text-align: left;
	}
	.findhit {
		display: flex;
		gap: 0.5rem;
		width: 100%;
		text-align: left;
		border: 0;
		background: transparent;
		border-radius: var(--radius-sm);
		padding: 0.22rem 0.4rem;
		color: var(--text-dim);
		font: 400 0.7rem/1.4 var(--font-mono);
	}
	.findhit:hover {
		background: var(--control-hover);
	}
	.findln {
		flex: none;
		min-width: 2.2rem;
		text-align: right;
		color: var(--text-faint);
	}
	.findsnip {
		flex: 1;
		min-width: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--text-dim);
	}
	.findsnip mark {
		background: var(--accent-bg-hover);
		color: var(--accent-text);
		border-radius: var(--radius-xs);
	}
	.findempty {
		padding: 0.6rem 0.5rem;
		font: 400 0.72rem var(--font-sans);
		color: var(--text-dimmer);
	}

	/* references strip — the active file's outbound references, as clickable chips */
	.ed-refs {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.45rem 1rem;
		border-bottom: var(--hairline) solid var(--border-soft);
		overflow-x: auto;
		white-space: nowrap;
	}
	.ed-refs-label {
		flex: none;
		font: 500 0.6rem var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-faint);
	}
	.refchip {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		max-width: 16rem;
		padding: 0.2rem 0.5rem;
		border: var(--hairline) solid var(--border);
		border-radius: var(--radius-full);
		background: var(--control);
		color: var(--text-dim);
		font: 500 0.68rem var(--font-mono);
		cursor: pointer;
	}
	.refchip:hover:not(:disabled) {
		background: var(--control-hover);
		border-color: var(--edge);
		color: var(--text);
	}
	.refchip:disabled {
		cursor: default;
		opacity: 0.5;
	}
	/* a reference that resolves to a graph node — accented, like the reference edges */
	.refchip.node {
		border-color: var(--accent);
		background: var(--accent-bg);
		color: var(--accent-text);
	}
	.refchip-kind {
		flex: none;
		color: var(--text-faint);
	}
	.refchip.node .refchip-kind {
		color: var(--accent);
	}
	.refchip-label {
		overflow: hidden;
		text-overflow: ellipsis;
		direction: rtl; /* keep the filename end visible when truncated */
		text-align: left;
	}

	/* reference edges march to distinguish them from the solid parent→child tree edges */
	.graphpane :global(.svelte-flow__edge.animated .svelte-flow__edge-path) {
		stroke-dasharray: 5 4;
	}
</style>
