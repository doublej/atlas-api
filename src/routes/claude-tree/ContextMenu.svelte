<script lang="ts">
import type { TreeNode } from '$lib/claude-tree'

// Right-click menu on a graph node. The page closes it on Escape and on any click outside
// `.ctxmenu`.
let {
  x,
  y,
  node,
  canReroot,
  canCollapse,
  collapsed,
  onreroot,
  ontoggle,
  oncopy,
  oncopyall,
}: {
  x: number
  y: number
  node: TreeNode
  canReroot: boolean
  canCollapse: boolean
  collapsed: boolean
  onreroot: () => void
  ontoggle: () => void
  oncopy: () => void
  oncopyall: () => void
} = $props()
</script>

<div class="ctxmenu" style="left: {x}px; top: {y}px;">
	<div class="ctxhead">{node.label}</div>
	{#if canReroot}
		<button onclick={onreroot}>Re-root tree here ↻</button>
	{/if}
	{#if canCollapse}
		<button onclick={ontoggle}>{collapsed ? 'Expand branch' : 'Collapse branch'}</button>
	{/if}
	{#if canReroot || canCollapse}
		<div class="ctxsep"></div>
	{/if}
	<button onclick={oncopy}>Copy contents</button>
	<button onclick={oncopyall}>Copy with ancestors</button>
</div>

<style>
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
	button {
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
	button:hover {
		background: var(--color-hover);
	}
	.ctxsep {
		height: 1px;
		margin: 4px 2px;
		background: var(--color-border-soft);
	}
</style>
