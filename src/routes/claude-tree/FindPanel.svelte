<script lang="ts">
import { tick } from 'svelte'
import type { SearchHit } from '$lib/claude-tree-match'
import Notice from '$lib/components/feedback/Notice.svelte'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import { fileHit, findSummary, splitSnippet } from './find'

// Find: a scope toggle (Tree = server-side over every file, File = client-side over the
// live editor content) feeding a snippet list that jumps to the line. Stays mounted while
// closed, so the query survives a close/reopen.
let {
  open,
  root,
  file,
  labels,
  onhit,
  onclose,
}: {
  open: boolean
  root: string
  /** The file in the editor ('' path = none), searched by File scope. */
  file: { path: string; content: string }
  labels: Map<string, string>
  onhit: (path: string, line: number) => void
  onclose: () => void
} = $props()

let scope = $state<'tree' | 'file'>('tree')
let query = $state('')
let treeHits = $state.raw<SearchHit[]>([])
let busy = $state(false)
let error = $state<string | null>(null)
let input = $state<HTMLInputElement | null>(null)

const hit = $derived(fileHit(file.path, file.content, query))
const hits = $derived<SearchHit[]>(scope === 'file' ? (hit ? [hit] : []) : treeHits)
const queryLen = $derived(query.trim().length) // highlight span on each snippet

/** Open (by the page) and put the caret in the box, query selected. */
export async function focus() {
  await tick()
  input?.focus()
  input?.select()
}

// Tree scope hits the server (debounced). File scope is purely derived, no fetch.
$effect(() => {
  const q = query.trim()
  if (!open || scope !== 'tree' || !q) {
    treeHits = []
    busy = false
    error = null
    return
  }
  busy = true
  const timer = setTimeout(() => void search(q), 200)
  return () => clearTimeout(timer)
})

async function search(q: string) {
  const url = `/api/claude-tree?search=${encodeURIComponent(q)}${root ? `&root=${encodeURIComponent(root)}` : ''}`
  try {
    treeHits = await http.get<SearchHit[]>(url)
    error = null
  } catch (e) {
    treeHits = []
    error = errorMessage(e)
  } finally {
    busy = false
  }
}
</script>

{#if open}
	<div class="findpanel">
		<div class="findscope">
			<button class:on={scope === 'tree'} onclick={() => (scope = 'tree')}>Tree</button>
			<button
				class:on={scope === 'file'}
				disabled={!file.path}
				title={file.path ? 'Search the open file' : 'Open a file to search it'}
				onclick={() => (scope = 'file')}>File</button
			>
			<span class="findspacer"></span>
			<button class="findclose" title="Close (Esc)" aria-label="Close find" onclick={onclose}
				>✕</button
			>
		</div>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="findinput"
			bind:this={input}
			bind:value={query}
			placeholder={scope === 'file' ? 'Find in file…' : 'Find in tree…'}
			spellcheck="false"
			autofocus
		/>
		{#if error}
			<div class="findnotice"><Notice tone="error">{error}</Notice></div>
		{/if}
		<div class="findmeta">
			{#if busy}
				searching…
			{:else if !error && query.trim()}
				{findSummary(hits)}
			{/if}
		</div>
		<div class="findlist">
			{#each hits as h (h.path)}
				<div class="findfile">
					<span class="findfile-label">{labels.get(h.path) ?? h.path}</span>
					<span class="findfile-path"><bdi>{h.path}</bdi></span>
				</div>
				{#each h.matches as m (m.line + ':' + m.col)}
					{@const [before, match, after] = splitSnippet(m.text, m.col, queryLen)}
					<button class="findhit" onclick={() => onhit(h.path, m.line)}>
						<span class="findln">{m.line}</span>
						<span class="findsnip">{before}<mark>{match}</mark>{after}</span>
					</button>
				{/each}
			{/each}
			{#if query.trim() && !busy && !error && hits.length === 0}
				<div class="findempty">No matches</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* overlays the top-left of the graph pane */
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
		background: var(--color-bg-elev);
		border: var(--hairline) solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 30px var(--color-overlay);
		overflow: hidden;
	}
	button {
		font: 500 0.76rem var(--font-sans);
		border-radius: var(--radius-sm);
		border: var(--hairline) solid var(--color-border);
		background: var(--color-card-2);
		color: var(--color-fg);
		cursor: pointer;
	}
	button:hover:not(:disabled) {
		background: var(--color-hover);
		border-color: var(--color-border-strong);
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.findscope {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.45rem 0.5rem 0.4rem;
		border-bottom: var(--hairline) solid var(--color-border-soft);
	}
	.findscope button {
		padding: 0.22rem 0.6rem;
		font: 600 0.7rem var(--font-sans);
	}
	.findscope button.on {
		border-color: var(--color-accent);
		background: var(--color-accent-soft);
		color: var(--color-accent-soft-fg);
	}
	.findspacer {
		flex: 1;
	}
	.findscope .findclose {
		padding: 0.22rem 0.45rem;
		color: var(--color-muted);
		border-color: transparent;
		background: transparent;
	}
	.findscope .findclose:hover {
		color: var(--color-fg);
	}
	.findinput {
		margin: 0.5rem 0.5rem 0;
		padding: 0.4rem 0.55rem;
		font: 400 0.78rem var(--font-mono);
		border: var(--hairline) solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-card-2);
		color: var(--color-fg);
		outline: 0;
	}
	.findinput:focus {
		border-color: var(--color-accent);
	}
	.findnotice {
		margin: 0.5rem 0.5rem 0;
	}
	.findmeta {
		padding: 0.35rem 0.6rem 0.25rem;
		font: 400 0.66rem var(--font-mono);
		color: var(--color-muted);
		min-height: 1rem;
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
		color: var(--color-fg);
	}
	.findfile-path {
		font: 400 0.6rem var(--font-mono);
		color: var(--color-muted-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		direction: rtl; /* keep the filename end visible when truncated; <bdi> keeps the path LTR */
		text-align: left;
	}
	.findhit {
		display: flex;
		gap: 0.5rem;
		width: 100%;
		text-align: left;
		border: 0;
		background: transparent;
		padding: 0.22rem 0.4rem;
		color: var(--color-fg-2);
		font: 400 0.7rem/1.4 var(--font-mono);
	}
	.findhit:hover {
		background: var(--color-hover);
	}
	.findln {
		flex: none;
		min-width: 2.2rem;
		text-align: right;
		color: var(--color-muted-2);
	}
	.findsnip {
		flex: 1;
		min-width: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: var(--color-fg-2);
	}
	.findsnip mark {
		background: var(--color-accent-soft);
		color: var(--color-accent-soft-fg);
		border-radius: var(--radius-xs);
	}
	.findempty {
		padding: 0.6rem 0.5rem;
		font: 400 0.72rem var(--font-sans);
		color: var(--color-muted);
	}
</style>
