<script lang="ts">
import { onMount, tick } from 'svelte'
import type { Reference, TreeNode } from '$lib/claude-tree'
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte'
import { theme } from '$lib/theme.svelte'
import AgentResultPanel from './AgentResultPanel.svelte'
import { AgentActions } from './agent.svelte'
import ContextMenu from './ContextMenu.svelte'
import { copyFiles } from './clipboard'
import { type Ask, Doc, fileNode } from './doc.svelte'
import EditorPane from './EditorPane.svelte'
import EntityActionMenu from './EntityActionMenu.svelte'
import FindPanel from './FindPanel.svelte'
import GraphPane from './GraphPane.svelte'
import { ancestorChain, folderOf } from './graph'
import { keyAction } from './keys'
import TopBar from './TopBar.svelte'
import { TreeView } from './tree.svelte'

// The composition root: the tree (graph), the open file (doc) and the agent actions are
// runes classes; this wires them to the panes and owns the cross-cutting bits — the dirty
// guard, the window keys and the node menu.

// A yes/no the page is waiting on (discard, overwrite, revert); one ConfirmDialog renders it.
let asking = $state<Ask | null>(null)
const view = new TreeView()
const doc = new Doc((q) => (asking = q))
const agent = new AgentActions(doc)

let root = $state('')
let menu = $state<{ x: number; y: number; node: TreeNode } | null>(null)
let findOpen = $state(false)
let find = $state<{ focus: () => Promise<void> }>()
let editor = $state<{ jumpToLine: (line: number) => void }>()

onMount(() => {
  root = new URL(location.href).searchParams.get('root') ?? ''
  void view.load(root)
})

function onKey(e: KeyboardEvent) {
  if (asking) return // the confirm dialog owns the keyboard while it is open
  const action = keyAction(e)
  if (action === 'dismiss') {
    menu = null
    findOpen = false
    agent.dismiss()
  } else if (action === 'save') {
    e.preventDefault()
    void doc.save()
  } else if (action === 'find') {
    e.preventDefault()
    void openFind()
  }
}

function onUnload(e: BeforeUnloadEvent) {
  if (doc.dirty) {
    e.preventDefault()
    e.returnValue = ''
  }
}

// Close the context / entity menu on any click outside it (no full-screen backdrop).
// The ✦ affordance lives in the editor, so its click must not self-close the menu it opens.
function onClick(e: MouseEvent) {
  const t = e.target as Element | null
  if (menu && !t?.closest('.ctxmenu')) menu = null
  if (agent.menu && !agent.busy && !t?.closest('.entity-menu, .cm-entity-action, .ed-ai'))
    agent.menu = null
}

/** Runs `then` now, or after a yes in the discard dialog while the editor holds unsaved edits. */
function unlessDirty(then: () => unknown) {
  if (!doc.dirty || !doc.node) return void then()
  asking = {
    title: 'Discard unsaved changes?',
    message: `Your edits to ${doc.label} are not saved.`,
    confirmLabel: 'Discard',
    run: then,
  }
}

/** Open a specific file (a node's primary, or one of its CLAUDE.md/AGENTS.md tabs). */
async function openFile(node: TreeNode, path: string, skipGuard = false): Promise<void> {
  const switching = node.id !== doc.node?.id || path !== doc.path
  if (!skipGuard && doc.dirty && switching) return unlessDirty(() => openFile(node, path, true))
  view.select(node.id)
  await doc.open(node, path)
}

function selectNode(id: string) {
  const node = view.byId.get(id)
  if (node) void openFile(node, node.path)
}

function closeEditor() {
  unlessDirty(() => {
    doc.close()
    view.select(null)
  })
}

/** Re-root the tree at this node's folder — ancestors above, descendants below, refetched. */
function navigateTo(node: TreeNode) {
  menu = null
  unlessDirty(async () => {
    root = folderOf(node.path)
    const url = new URL(location.href)
    url.searchParams.set('root', root)
    window.history.replaceState(null, '', url)
    doc.close()
    view.selected = null
    await view.load(root)
  })
}

function openMenu(event: MouseEvent, id: string) {
  event.preventDefault()
  const node = view.byId.get(id)
  if (node) menu = { x: Math.min(event.clientX, window.innerWidth - 220), y: event.clientY, node }
}

async function openFind() {
  findOpen = true
  await find?.focus()
}

/** Open the hit's file in the editor (honoring the dirty guard) and jump to the line. */
function openHit(path: string, line: number) {
  const ref = view.files.get(path)
  if (!ref) return
  if (doc.node?.id === ref.node.id && doc.path === ref.path) return editor?.jumpToLine(line)
  // The jump belongs to the new file, so it waits for the discard dialog with the open.
  unlessDirty(async () => {
    await openFile(ref.node, ref.path, true)
    await tick()
    editor?.jumpToLine(line)
  })
}

/** Follow a reference: select its node when it is one, else open the file it points at. */
async function openReference(ref: Reference) {
  const node = ref.targetId ? view.byId.get(ref.targetId) : undefined
  if (node) return openFile(node, ref.targetPath ?? node.path)
  if (ref.targetPath) await openFile(fileNode(ref.targetPath), ref.targetPath)
}

async function syncToAgents() {
  const node = await doc.sync()
  if (node) view.patch(node)
}

function toggleBranch(node: TreeNode) {
  menu = null
  view.toggle(node.id)
}

/** Copy one node's file, or it and every ancestor above it (load order). */
function copyNode(node: TreeNode, withAncestors: boolean) {
  menu = null
  void copyFiles(node, withAncestors ? ancestorChain(node, view.byId) : null)
}
</script>

<svelte:head>
	<title>Atlas - Claude Tree</title>
</svelte:head>
<svelte:window onkeydown={onKey} onbeforeunload={onUnload} onclick={onClick} />

<div class="page">
	<TopBar
		{root}
		refsMode={view.refsMode}
		{findOpen}
		oncyclerefs={() => view.cycleRefs()}
		onfind={openFind}
	/>
	<div class="split">
		<aside class="graphpane" class:full={!doc.node}>
			<GraphPane
				{view}
				focusId={doc.node?.id ?? null}
				onretry={() => view.load(root)}
				onselect={selectNode}
				onmenu={openMenu}
			/>
			<FindPanel
				bind:this={find}
				open={findOpen}
				{root}
				file={{ path: doc.path, content: doc.content }}
				labels={view.labels}
				onhit={openHit}
				onclose={() => (findOpen = false)}
			/>
		</aside>

		{#if doc.node}
			<EditorPane
				bind:this={editor}
				{doc}
				{agent}
				dark={theme.mode === 'dark'}
				onclose={closeEditor}
				onopen={(path) => doc.node && openFile(doc.node, path)}
				onreference={openReference}
				onsync={syncToAgents}
			/>
		{/if}
	</div>
</div>

{#if menu}
	{@const node = menu.node}
	<ContextMenu
		x={menu.x}
		y={menu.y}
		{node}
		canReroot={folderOf(node.path) !== root}
		canCollapse={view.hasChildren(node.id)}
		collapsed={view.collapsed.has(node.id)}
		onreroot={() => navigateTo(node)}
		ontoggle={() => toggleBranch(node)}
		oncopy={() => copyNode(node, false)}
		oncopyall={() => copyNode(node, true)}
	/>
{/if}

{#if agent.menu}
	<EntityActionMenu
		entity={agent.menu.entity}
		pos={agent.menu.pos}
		engine={agent.engine}
		busy={agent.busy}
		onRun={(p) => agent.run(p)}
		onEngineChange={(e) => (agent.engine = e)}
		onClose={() => (agent.menu = null)}
	/>
{/if}

{#if agent.panel}
	<AgentResultPanel
		title={agent.panel.title}
		engine={agent.engine}
		busy={agent.panel.busy}
		text={agent.panel.text}
		error={agent.panel.error}
		onClose={() => (agent.panel = null)}
	/>
{/if}

<ConfirmDialog
	open={asking !== null}
	title={asking?.title ?? ''}
	message={asking?.message}
	confirmLabel={asking?.confirmLabel}
	danger
	onconfirm={() => asking?.run()}
	onclose={() => (asking = null)}
/>

<style>
	.page {
		height: calc(100vh - var(--nav-h));
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
		color: var(--color-fg);
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
		border-right: var(--hairline) solid var(--color-border);
		position: relative;
	}
	/* editor closed → graph takes the whole width */
	.graphpane.full {
		flex: 1 1 auto;
		max-width: none;
		resize: none;
		border-right: 0;
	}
	/* narrow screens: graph above, editor below */
	@media (max-width: 768px) {
		.split {
			flex-direction: column;
		}
		.graphpane {
			min-width: 0;
			max-width: none;
			resize: none;
			border-right: 0;
			border-bottom: var(--hairline) solid var(--color-border);
		}
	}
</style>
