<script lang="ts">
	import type { Entity } from '$lib/claude-tree-entities';
	import { ENTITY_ACTIONS, type AgentAction, type AgentEngine } from '$lib/claude-tree-actions';

	let {
		entity,
		pos,
		engine,
		busy = false,
		onRun,
		onEngineChange,
		onClose
	}: {
		entity: Entity;
		pos: { x: number; y: number };
		engine: AgentEngine;
		busy?: boolean;
		onRun: (p: { actionId: string; locked: boolean; question?: string }) => void;
		onEngineChange: (e: AgentEngine) => void;
		onClose: () => void;
	} = $props();

	// Auto-checked: by default the agent may only rewrite this one item.
	// For the whole-file action the lock is moot — the file is always the scope.
	let locked = $state(true);
	let asking = $state<AgentAction | null>(null); // the input-collecting action awaiting text
	let question = $state('');

	const isFile = $derived(entity.kind === 'file');
	const effectiveLocked = $derived(isFile ? false : locked);

	const MENU_W = 248;
	const left = $derived(Math.min(pos.x, (globalThis.innerWidth ?? 1280) - MENU_W - 8));

	function pick(action: AgentAction) {
		if (busy) return;
		if (action.needsInput) {
			asking = action;
			question = '';
			return;
		}
		onRun({ actionId: action.id, locked: effectiveLocked });
	}

	function submitInput() {
		if (busy || !asking || !question.trim()) return;
		onRun({ actionId: asking.id, locked: effectiveLocked, question });
	}
</script>

<div class="entity-menu" style="left: {left}px; top: {pos.y}px; width: {MENU_W}px;" role="menu" tabindex="-1">
	<header class="em-head">
		<span class="em-kind" class:wide={isFile || entity.kind === 'section' || entity.kind === 'block'}
			>{isFile ? 'whole file' : entity.kind}</span
		>
		<span class="em-title">{entity.title}</span>
		<button class="em-close" title="Close (Esc)" aria-label="Close" onclick={onClose}>✕</button>
	</header>

	<div class="em-engine" role="group" aria-label="Agent engine">
		<button class:on={engine === 'claude'} disabled={busy} onclick={() => onEngineChange('claude')}>Claude</button>
		<button class:on={engine === 'codex'} disabled={busy} onclick={() => onEngineChange('codex')}>Codex</button>
	</div>

	<div class="em-actions">
		{#each ENTITY_ACTIONS as action (action.id)}
			<button
				class="em-action"
				class:answer={action.mode === 'answer'}
				disabled={busy}
				onclick={() => pick(action)}
			>
				<span class="em-icon">{action.icon}</span>
				<span>{action.label}</span>
				<span class="em-mode">{action.mode === 'edit' ? 'edit' : 'read'}</span>
			</button>
		{/each}
	</div>

	{#if asking}
		<div class="em-ask">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				bind:value={question}
				placeholder={asking.id === 'custom' ? 'Describe the change…' : 'Ask about this item…'}
				disabled={busy}
				autofocus
				onkeydown={(e) => e.key === 'Enter' && submitInput()}
			/>
			<button class="em-send" disabled={busy || !question.trim()} onclick={submitInput}>
				{asking.id === 'custom' ? 'Run' : 'Ask'}
			</button>
		</div>
	{/if}

	{#if !isFile}
		<label class="em-lock" class:disabled={busy}>
			<input type="checkbox" bind:checked={locked} disabled={busy} />
			Agent can only change this item
		</label>
	{/if}

	{#if busy}
		<div class="em-busy">Running {engine}…</div>
	{/if}
</div>

<style>
	.entity-menu {
		position: fixed;
		z-index: 60;
		background: var(--color-bg-elev);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: 0 12px 32px var(--color-overlay);
		padding: 6px;
		font-size: 0.78rem;
		color: var(--color-fg);
	}
	.em-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 2px 4px 6px;
		border-bottom: 1px solid var(--color-border-soft);
	}
	.em-kind {
		font: 600 0.6rem/1 var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 2px 5px;
		border-radius: 4px;
		background: var(--color-card-2);
		color: var(--color-fg-2);
	}
	.em-kind.wide {
		background: var(--color-accent-soft);
		color: var(--color-accent-soft-fg);
	}
	.em-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--color-fg-2);
	}
	.em-close {
		border: none;
		background: none;
		color: var(--color-muted);
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0 2px;
	}
	.em-close:hover {
		color: var(--color-fg);
	}
	.em-engine {
		display: flex;
		gap: 2px;
		margin: 6px 2px;
		background: var(--color-card-2);
		border-radius: 6px;
		padding: 2px;
	}
	.em-engine button {
		flex: 1;
		border: none;
		background: none;
		color: var(--color-fg-2);
		border-radius: 4px;
		padding: 3px 0;
		cursor: pointer;
		font: 600 0.72rem var(--font-mono);
	}
	.em-engine button.on {
		background: var(--color-bg-elev);
		color: var(--color-fg);
		box-shadow: 0 1px 2px var(--color-overlay);
	}
	.em-actions {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.em-action {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		width: 100%;
		text-align: left;
		border: none;
		background: none;
		color: var(--color-fg);
		padding: 6px 6px;
		border-radius: 6px;
		cursor: pointer;
	}
	.em-action:hover:not(:disabled) {
		background: var(--color-hover);
	}
	.em-action:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.em-icon {
		width: 1.1rem;
		text-align: center;
		color: var(--color-accent);
	}
	.em-action.answer .em-icon {
		color: var(--color-info);
	}
	.em-mode {
		margin-left: auto;
		font: 500 0.6rem var(--font-mono);
		color: var(--color-muted-2);
	}
	.em-ask {
		display: flex;
		gap: 4px;
		margin: 4px 2px;
	}
	.em-ask input {
		flex: 1;
		min-width: 0;
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		padding: 4px 6px;
		color: var(--color-fg);
		font-size: 0.76rem;
	}
	.em-send {
		border: none;
		background: var(--color-accent);
		color: var(--color-accent-fg, #fff);
		border-radius: 6px;
		padding: 0 10px;
		cursor: pointer;
		font-weight: 600;
	}
	.em-send:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.em-lock {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		margin: 6px 4px 2px;
		padding-top: 6px;
		border-top: 1px solid var(--color-border-soft);
		color: var(--color-fg-2);
		cursor: pointer;
		font-size: 0.74rem;
	}
	.em-lock.disabled {
		opacity: 0.5;
		cursor: default;
	}
	.em-busy {
		margin: 4px 4px 2px;
		font: 500 0.72rem var(--font-mono);
		color: var(--color-accent);
	}
</style>
