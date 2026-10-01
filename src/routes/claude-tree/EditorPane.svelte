<script lang="ts">
import type { Reference } from '$lib/claude-tree'
import Button from '$lib/components/ui/Button.svelte'
import type { AgentActions } from './agent.svelte'
import CmEditor from './CmEditor.svelte'
import type { Doc } from './doc.svelte'
import EditorHead from './EditorHead.svelte'

// The open file: header + references, the CodeMirror buffer, and Save / Revert / Sync /
// History underneath.
let {
  doc,
  agent,
  dark,
  onclose,
  onopen,
  onreference,
  onsync,
}: {
  doc: Doc
  agent: AgentActions
  dark: boolean
  onclose: () => void
  onopen: (path: string) => void
  onreference: (ref: Reference) => void
  onsync: () => void
} = $props()

let cm = $state<{ jumpToLine: (line: number) => void }>()

/** Select + scroll a 1-based line into view (find's jump). */
export function jumpToLine(line: number) {
  cm?.jumpToLine(line)
}
</script>

<main class="editorpane">
	<EditorHead {doc} {agent} {onclose} {onopen} {onreference} />
	<!-- A fresh editor per file, so undo can't carry the previous file's text into this one.
	     doc.open switches path and content together, so it mounts with the new file's text. -->
	{#key doc.path}
		<CmEditor
			bind:this={cm}
			value={doc.content}
			references={doc.inlineRefs}
			{dark}
			activeRange={agent.range}
			onChange={(v) => doc.edit(v)}
			onRefClick={onreference}
			onEntityAction={(entity, pos) => agent.open(entity, pos)}
		/>
	{/key}
	<footer class="ed-foot">
		<!-- primary only while there is something to save: a disabled primary still reads as live -->
		<Button variant={doc.dirty ? 'primary' : 'ghost'} onclick={() => doc.save()} disabled={!doc.dirty}
			>Save</Button
		>
		<Button onclick={() => doc.revert()} disabled={doc.history.length === 0}>Revert</Button>
		{#if doc.canSync}
			<Button onclick={onsync} title="Copy CLAUDE.md → AGENTS.md (creates AGENTS.md if missing)"
				>Sync → AGENTS.md</Button
			>
		{/if}
		<span class="spacer"></span>
		<label>
			History
			<select bind:value={doc.snapshot} onchange={() => doc.previewSnapshot()}>
				<option value="">(latest)</option>
				{#each doc.history as h, i (h.ts + h.sha)}
					<option value={String(i)}>{h.ts} · {h.sha}</option>
				{/each}
			</select>
		</label>
	</footer>
</main>

<style>
	.editorpane {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: var(--color-card);
	}
	.ed-foot {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		padding: 0.6rem 1rem;
		border-top: var(--hairline) solid var(--color-border-soft);
		font-size: 0.76rem;
		background: var(--color-bg-elev);
	}
	.spacer {
		flex: 1;
	}
	label {
		color: var(--color-fg-2);
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}
	select {
		font: 500 0.72rem var(--font-mono);
		padding: 0.3rem 0.45rem;
		border-radius: var(--radius-sm);
		border: var(--hairline) solid var(--color-border);
		background: var(--color-card-2);
		color: var(--color-fg);
	}
</style>
