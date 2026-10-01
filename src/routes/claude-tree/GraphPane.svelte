<script lang="ts">
import { Background, BackgroundVariant, Controls, MiniMap, SvelteFlow } from '@xyflow/svelte'
import { setContext } from 'svelte'
import '@xyflow/svelte/dist/style.css'
import PageState from '$lib/components/feedback/PageState.svelte'
import FocusNode from './FocusNode.svelte'
import TreeNodeCard from './TreeNodeCard.svelte'
import type { TreeView } from './tree.svelte'

let {
  view,
  focusId,
  onretry,
  onselect,
  onmenu,
}: {
  view: TreeView
  focusId: string | null
  onretry: () => void
  onselect: (id: string) => void
  onmenu: (event: MouseEvent, id: string) => void
} = $props()

const nodeTypes = { claudeCard: TreeNodeCard }

// Live viewport — cards read the zoom (via context) to switch to a title-only LOD.
let viewport = $state({ x: 0, y: 0, zoom: 1 })
setContext('atlas-zoom', () => viewport.zoom)
</script>

<div class="flow">
	<PageState
		loading={view.loading}
		loadingText="Scanning…"
		error={view.error}
		{onretry}
		empty={view.tree.length === 0}
		emptyText="No CLAUDE.md, AGENTS.md or rules under this folder."
	>
		<SvelteFlow
			bind:nodes={view.nodes}
			bind:edges={view.edges}
			bind:viewport
			{nodeTypes}
			fitView
			fitViewOptions={{ minZoom: 1, maxZoom: 1, padding: 0.12 }}
			minZoom={0.2}
			maxZoom={2}
			nodesDraggable={false}
			onnodeclick={({ node }) => onselect(node.id)}
			onnodecontextmenu={({ event, node }) => onmenu(event as MouseEvent, node.id)}
		>
			<Background variant={BackgroundVariant.Dots} gap={22} size={1} />
			<Controls showLock={false} />
			<MiniMap pannable zoomable />
			<FocusNode {focusId} />
		</SvelteFlow>
	</PageState>
</div>

<style>
	.flow {
		display: flex;
		flex-direction: column;
		height: 100%;
	}
	/* PageState's line and notice, when there is no graph to show */
	.flow > :global(p),
	.flow > :global(.empty),
	.flow > :global(.notice) {
		margin: var(--space-6);
	}
	/* The canvas takes its colours from the theme tokens, so it flips with .dark. */
	.flow :global(.svelte-flow) {
		--xy-background-color: var(--color-bg);
		--xy-background-pattern-color: var(--color-border);
		--xy-minimap-background-color: var(--color-bg-elev);
		--xy-minimap-node-background-color: var(--color-border-strong);
		--xy-minimap-mask-background-color: color-mix(in srgb, var(--color-bg) 70%, transparent);

		flex: 1;
		min-height: 0;
		width: 100%;
		height: 100%;
		background: var(--color-bg);
	}
	.flow :global(.svelte-flow__edge-path) {
		stroke: var(--color-border-strong);
		stroke-width: 1.5;
	}
	/* reference edges march to distinguish them from the solid parent→child tree edges */
	.flow :global(.svelte-flow__edge.animated .svelte-flow__edge-path) {
		stroke-dasharray: 5 4;
	}
	.flow :global(.svelte-flow__controls-button) {
		background: var(--color-card-2);
		border-bottom: var(--hairline) solid var(--color-border);
		fill: var(--color-fg-2);
	}
	.flow :global(.svelte-flow__controls-button:hover) {
		background: var(--color-hover);
	}
	.flow :global(.svelte-flow__attribution) {
		background: transparent;
		color: var(--color-muted-2);
	}
</style>
