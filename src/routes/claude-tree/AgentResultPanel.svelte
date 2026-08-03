<script lang="ts">
import type { AgentEngine } from '$lib/claude-tree-actions'

let {
  title,
  engine,
  busy = false,
  text = '',
  error = null,
  onClose,
}: {
  title: string
  engine: AgentEngine
  busy?: boolean
  text?: string
  error?: string | null
  onClose: () => void
} = $props()

let copied = $state(false)

async function copy() {
  await navigator.clipboard.writeText(text)
  copied = true
  setTimeout(() => (copied = false), 1400)
}
</script>

<aside class="agent-panel" aria-label="Agent answer">
	<header class="ap-head">
		<span class="ap-engine">{engine}</span>
		<span class="ap-title">{title}</span>
		{#if text && !busy}
			<button class="ap-btn" onclick={copy}>{copied ? 'copied' : 'copy'}</button>
		{/if}
		<button class="ap-btn" title="Close" aria-label="Close" onclick={onClose}>✕</button>
	</header>
	<div class="ap-body">
		{#if busy}
			<div class="ap-busy">Asking {engine}…</div>
		{:else if error}
			<div class="ap-err">{error}</div>
		{:else}
			<pre class="ap-text">{text}</pre>
		{/if}
	</div>
</aside>

<style>
	.agent-panel {
		position: fixed;
		right: 16px;
		bottom: 16px;
		z-index: 55;
		width: min(440px, 42vw);
		max-height: 48vh;
		display: flex;
		flex-direction: column;
		background: var(--color-bg-elev);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		box-shadow: 0 16px 40px var(--color-overlay);
		overflow: hidden;
		color: var(--color-fg);
	}
	.ap-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 8px 10px;
		border-bottom: 1px solid var(--color-border-soft);
		background: var(--color-card-2);
	}
	.ap-engine {
		font: 600 0.6rem/1 var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 2px 6px;
		border-radius: 4px;
		background: var(--color-accent-soft);
		color: var(--color-accent-soft-fg);
	}
	.ap-title {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.8rem;
		color: var(--color-fg-2);
	}
	.ap-btn {
		border: 1px solid var(--color-border);
		background: var(--color-bg);
		color: var(--color-fg-2);
		border-radius: 6px;
		padding: 2px 7px;
		cursor: pointer;
		font: 500 0.68rem var(--font-mono);
	}
	.ap-btn:hover {
		color: var(--color-fg);
		border-color: var(--color-border-strong);
	}
	.ap-body {
		overflow: auto;
		padding: 10px 12px;
	}
	.ap-text {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font: 0.8rem/1.6 var(--font-mono);
		color: var(--color-fg);
	}
	.ap-busy {
		font: 500 0.78rem var(--font-mono);
		color: var(--color-accent);
	}
	.ap-err {
		font-size: 0.8rem;
		color: var(--color-neg);
	}
</style>
