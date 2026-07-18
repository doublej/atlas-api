<script lang="ts">
	import { getContext } from 'svelte';
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import type { NodeKind, Preview } from '$lib/claude-tree';
	import { RECOMMENDED_TOKENS } from '$lib/tree-layout';

	// Zoomed-out level-of-detail: below this zoom, render a title-only card.
	const getZoom = getContext<() => number>('atlas-zoom');
	const compact = $derived((getZoom?.() ?? 1) < 0.5);

	type CardData = {
		label: string;
		kind: NodeKind;
		preview: Preview;
		tokensAccumulated: number;
		collapsed?: boolean;
		hidden?: number;
		hasAgents?: boolean; // folder also has an AGENTS.md sibling
		globs?: string[]; // a rule's `paths:` attach globs
		refs?: number; // count of distinct context files this node references
		height?: number; // layout height — compact LOD reuses it for a same-size container
	};

	let { data, selected }: NodeProps = $props();
	const card = $derived(data as CardData);
	const empty = $derived(!card.preview.h1 && !card.preview.blurb && !card.preview.sections.length);
	const over = $derived(card.preview.tokens > RECOMMENDED_TOKENS);

	// "CLAUDE.md" / "AGENTS.md" headings say nothing — never use them as a title.
	const isGenericName = (s: string) => /^(claude|agents)\.md$/i.test(s.trim());
	const h1Title = $derived(card.preview.h1 && !isGenericName(card.preview.h1) ? card.preview.h1 : '');
	// Display title: the meaningful H1, else the deepest folder segment of the label.
	const titleText = $derived(h1Title || (card.label.split('/').filter(Boolean).pop() ?? card.label));

	// Monospace label: clip the START so the most-specific folder stays visible; never wrap.
	const MAX_LABEL = 26;
	const displayLabel = $derived(
		card.label.length <= MAX_LABEL ? card.label : '…' + card.label.slice(-(MAX_LABEL - 1))
	);

	function fmt(n: number): string {
		if (n < 1000) return String(n);
		const k = n / 1000;
		return (k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')) + 'k';
	}
</script>

<!-- tree edges enter top (t) / leave bottom (b); reference edges enter left (l) / leave right (r) -->
<Handle id="t" type="target" position={Position.Top} class="cm-handle" />
<Handle id="l" type="target" position={Position.Left} class="cm-handle" />

<div
	class="cmcard"
	class:sel={selected}
	class:compact
	data-kind={card.kind}
	data-over={over}
	style:height={compact && card.height ? `${card.height}px` : null}
>
	{#if compact}
		<!-- zoomed out: same-size container, just a large centered title -->
		<div class="cmbig" title={card.label}>{titleText}</div>
	{:else}
	<!-- titlebar: this node is a CLAUDE.md, labelled by its folder -->
	<div class="cmhead">
		<svg class="cmicon" viewBox="0 0 14 16" width="11" height="13" aria-hidden="true">
			<path
				d="M2.5 1h5L12 4.5V14a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
			/>
			<path d="M7.5 1v3.5H12" fill="none" stroke="currentColor" stroke-width="1.2" />
		</svg>
		<span class="cmname" title={card.label}>{displayLabel}</span>
		{#if card.collapsed}
			<span class="cmcollapse" title="{card.hidden} hidden — right-click to expand">▸ {card.hidden}</span>
		{/if}
		{#if card.hasAgents}
			<span class="cmagents" title="AGENTS.md present in this folder">A</span>
		{/if}
		{#if card.refs}
			<span class="cmrefs" title="references {card.refs} other context file{card.refs === 1 ? '' : 's'}"
				>→ {card.refs}</span
			>
		{/if}
		<span class="cmkind">{card.kind}</span>
	</div>

	<!-- viewport: a look inside the file -->
	<div class="cmview">
		{#if empty}
			<div class="cmblurb">(empty)</div>
		{:else}
			{#if h1Title}<div class="cmtitle">{h1Title}</div>{/if}
			{#if card.preview.blurb}<div class="cmblurb">{card.preview.blurb}</div>{/if}
			{#if card.preview.sections.length}
				<div class="cmsecs">§ {card.preview.sections.join(' · ')}</div>
			{/if}
		{/if}
		{#if card.globs?.length}
			<div class="cmglobs" title="applies to: {card.globs.join(', ')}">↦ {card.globs.join(' · ')}</div>
		{/if}
	</div>

	<!-- footer: size + token budget (alone, then accumulated up the chain) -->
	<div class="cmfoot">
		<span>{card.preview.lines} lines</span>
		<span class="cmsep">·</span>
		<span class="cmtok" class:over>{fmt(card.preview.tokens)} tok</span>
		<span class="cmacc" title="accumulated: this file + all ancestors loaded with it">
			Σ {fmt(card.tokensAccumulated)}
		</span>
	</div>
	{/if}
</div>

<Handle id="b" type="source" position={Position.Bottom} class="cm-handle" />
<Handle id="r" type="source" position={Position.Right} class="cm-handle" />

<style>
	.cmcard {
		width: 240px;
		text-align: left;
		background: var(--card-bg);
		border: 1px solid var(--border);
		border-radius: 9px;
		overflow: hidden;
		transition: border-color 0.12s, box-shadow 0.12s;
	}
	.cmcard.sel {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px var(--accent);
	}
	/* over the recommended token budget — flag the node */
	.cmcard[data-over='true']:not(.sel) {
		border-color: var(--danger);
	}
	/* rules read as attached sidecars: dashed, rule-tinted, distinct from hierarchy cards */
	.cmcard[data-kind='rule'] {
		border-style: dashed;
		border-color: color-mix(in srgb, var(--kind-rule) 55%, var(--border));
		background: color-mix(in srgb, var(--kind-rule) 5%, var(--card-bg));
	}
	.cmcard[data-kind='rule'] .cmhead {
		background: color-mix(in srgb, var(--kind-rule) 12%, var(--card-head));
	}

	/* titlebar */
	.cmhead {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 10px;
		background: var(--card-head);
		border-bottom: 1px solid var(--border);
	}
	/* one --kind-color per node kind drives the icon, the badge chip, and the compact bar */
	.cmcard[data-kind='root'] {
		--kind-color: var(--kind-root);
	}
	.cmcard[data-kind='project'] {
		--kind-color: var(--kind-project);
	}
	.cmcard[data-kind='ancestor'] {
		--kind-color: var(--kind-ancestor);
	}
	.cmcard[data-kind='glossary'] {
		--kind-color: var(--kind-glossary);
	}
	.cmcard[data-kind='rule'] {
		--kind-color: var(--kind-rule);
	}
	.cmcard[data-kind='descendant'] {
		--kind-color: var(--kind-descendant);
	}
	.cmicon {
		flex: none;
		color: var(--kind-color, var(--text-dimmer));
	}
	.cmname {
		flex: 1 1 auto;
		min-width: 0;
		font: 500 10px/1.35 var(--font-mono);
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
	}
	.cmkind {
		flex: none;
		font: 500 8px/1 var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 2px 6px;
		border-radius: 999px;
		color: var(--kind-color, var(--text-dimmer));
		background: color-mix(in srgb, var(--kind-color, var(--text-faint)) 16%, transparent);
	}
	/* zoomed-out LOD: keep the card's footprint (height set inline = layout height),
	   drop every detail, show one large centered title. */
	.cmcard.compact {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 14px;
	}
	.cmbig {
		font: 600 24px/1.15 var(--font-sans);
		text-align: center;
		letter-spacing: -0.02em;
		color: var(--text);
		word-break: break-word;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.cmcollapse {
		flex: none;
		font: 600 8px/1 var(--font-mono);
		padding: 2px 6px;
		border-radius: 999px;
		color: var(--color-warn);
		background: color-mix(in srgb, var(--color-warn) 16%, transparent);
	}
	.cmagents,
	.cmrefs {
		flex: none;
		font: 600 8px/1 var(--font-mono);
		padding: 2px 5px;
		border-radius: 999px;
	}
	.cmagents {
		color: var(--color-pos);
		background: color-mix(in srgb, var(--color-pos) 16%, transparent);
	}
	.cmrefs {
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 16%, transparent);
	}

	/* viewport — inset "screen" looking into the file */
	.cmview {
		margin: 10px;
		padding: 9px 10px;
		background: var(--card-view);
		border: 1px solid var(--border-faint);
		border-radius: 6px;
	}
	.cmtitle {
		font: 600 11px/1.3 var(--font-sans);
		color: var(--text);
		letter-spacing: -0.01em;
		margin-bottom: 5px;
	}
	.cmblurb {
		font: 400 9px/1.5 var(--font-sans);
		color: var(--card-muted);
		display: -webkit-box;
		-webkit-line-clamp: 6;
		line-clamp: 6;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.cmsecs {
		margin-top: 5px;
		font: 400 8px/1.5 var(--font-mono);
		color: var(--accent);
		display: -webkit-box;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	/* a rule's attach globs (from `paths:` frontmatter) */
	.cmglobs {
		margin-top: 5px;
		font: 400 8px/1.45 var(--font-mono);
		color: var(--kind-rule);
		word-break: break-all;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* footer — line + token stats */
	.cmfoot {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: var(--card-head);
		border-top: 1px solid var(--border);
		font: 400 9px/1.2 var(--font-mono);
		color: var(--text-dimmer);
	}
	.cmsep {
		color: var(--edge);
	}
	.cmtok.over {
		color: var(--danger);
		font-weight: 600;
	}
	.cmacc {
		margin-left: auto;
		color: var(--color-warn);
		font-weight: 500;
	}
	:global(.cm-handle) {
		opacity: 0;
		width: 1px;
		height: 1px;
	}
</style>
