<script lang="ts">
import type { Reference } from '$lib/claude-tree'
import type { AgentActions } from './agent.svelte'
import type { Doc } from './doc.svelte'

// The editor's header (close, CLAUDE.md/AGENTS.md tabs, path, AI button, status) and the
// strip of the open file's references.
let {
  doc,
  agent,
  onclose,
  onopen,
  onreference,
}: {
  doc: Doc
  agent: AgentActions
  onclose: () => void
  onopen: (path: string) => void
  onreference: (ref: Reference) => void
} = $props()

const refIcons: Record<Reference['kind'], string> = {
  link: '↗',
  import: '@',
  wikilink: '⟦⟧',
  'code-path': '/',
}
</script>

<header class="ed-head">
	<button class="ed-close" title="Close editor" onclick={onclose}>✕</button>
	{#if doc.tabs.length > 1}
		<div class="ed-tabs" role="tablist">
			{#each doc.tabs as t (t.kind)}
				<button
					class="ed-tab"
					class:on={doc.path === t.path}
					role="tab"
					aria-selected={doc.path === t.path}
					onclick={() => onopen(t.path)}>{t.name}</button
				>
			{/each}
		</div>
	{:else}
		<code class="ed-label">{doc.node?.label}</code>
	{/if}
	<span class="ed-path">{doc.path}</span>
	<button
		class="ed-ai"
		title="AI actions for the whole file"
		aria-label="AI actions for the whole file"
		onclick={(e) => agent.openFile(e)}
	>
		<span class="ed-ai-glyph">✦</span> AI
	</button>
	<span class="badge" class:dirty={doc.dirty}>{doc.status}</span>
</header>
{#if doc.refs.length}
	<div class="ed-refs">
		<span class="ed-refs-label">refs</span>
		{#each doc.refs as r (r.kind + r.rawPath + r.line)}
			<button
				class="refchip"
				class:node={!!r.targetId}
				disabled={!r.targetPath}
				title={r.targetPath ?? `${r.rawPath} (unresolved)`}
				onclick={() => onreference(r)}
			>
				<span class="refchip-kind">{refIcons[r.kind]}</span>
				<span class="refchip-label">{r.label}</span>
			</button>
		{/each}
	</div>
{/if}

<style>
	.ed-head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.7rem 1rem;
		border-bottom: var(--hairline) solid var(--color-border-soft);
		flex-wrap: wrap;
	}
	button {
		cursor: pointer;
	}
	.ed-close {
		flex: none;
		padding: 0 0.45rem;
		border: 0;
		background: transparent;
		color: var(--color-muted);
		font-size: 0.78rem;
		line-height: 1;
		align-self: center;
	}
	.ed-close:hover {
		color: var(--color-fg);
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
		border: var(--hairline) solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-card-2);
		color: var(--color-fg-2);
	}
	.ed-tab:hover {
		background: var(--color-hover);
		border-color: var(--color-border-strong);
	}
	.ed-tab.on {
		border-color: var(--color-accent);
		background: var(--color-accent-soft);
		color: var(--color-accent-soft-fg);
	}
	.ed-path {
		color: var(--color-muted-2);
		font: 400 0.7rem var(--font-mono);
		overflow-wrap: anywhere;
		flex: 1 1 auto;
	}
	.ed-ai {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: var(--hairline) solid var(--color-accent);
		background: var(--color-accent-soft);
		color: var(--color-accent);
		border-radius: var(--radius-full);
		padding: 2px 11px;
		font: 600 0.72rem var(--font-mono);
		white-space: nowrap;
	}
	.ed-ai-glyph {
		font-size: 0.9rem;
		line-height: 1;
	}
	.badge {
		font: 500 0.66rem var(--font-mono);
		padding: 2px 8px;
		border-radius: var(--radius-full);
		background: var(--color-accent-soft);
		color: var(--color-accent);
		white-space: nowrap;
	}
	.badge.dirty {
		background: var(--color-neg-soft);
		color: var(--color-neg);
	}

	/* references strip — the active file's outbound references, as clickable chips */
	.ed-refs {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.45rem 1rem;
		border-bottom: var(--hairline) solid var(--color-border-soft);
		overflow-x: auto;
		white-space: nowrap;
	}
	.ed-refs-label {
		flex: none;
		font: 500 0.6rem var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-muted-2);
	}
	.refchip {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		max-width: 16rem;
		padding: 0.2rem 0.5rem;
		border: var(--hairline) solid var(--color-border);
		border-radius: var(--radius-full);
		background: var(--color-card-2);
		color: var(--color-fg-2);
		font: 500 0.68rem var(--font-mono);
	}
	.refchip:hover:not(:disabled) {
		background: var(--color-hover);
		border-color: var(--color-border-strong);
		color: var(--color-fg);
	}
	.refchip:disabled {
		cursor: default;
		opacity: 0.5;
	}
	/* a reference that resolves to a graph node — accented, like the reference edges */
	.refchip.node {
		border-color: var(--color-accent);
		background: var(--color-accent-soft);
		color: var(--color-accent-soft-fg);
	}
	.refchip-kind {
		flex: none;
		color: var(--color-muted-2);
	}
	.refchip.node .refchip-kind {
		color: var(--color-accent);
	}
	.refchip-label {
		overflow: hidden;
		text-overflow: ellipsis;
		direction: rtl; /* keep the filename end visible when truncated */
		text-align: left;
	}
</style>
