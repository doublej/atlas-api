<script lang="ts">
import type { RefsMode } from './graph'

let {
  root,
  refsMode,
  findOpen,
  oncyclerefs,
  onfind,
}: {
  root: string
  refsMode: RefsMode
  findOpen: boolean
  oncyclerefs: () => void
  onfind: () => void
} = $props()

const refsLabel = { all: 'all', selected: 'selected node only', off: 'hidden' }
const refsIcon = { all: '⇄', selected: '◎', off: '⊘' }
</script>

<header class="topbar">
	<h1>CLAUDE.md tree</h1>
	<span class="proj">{root || '~/dev'}</span>
	<span class="hint">Click a node · <kbd>⌘/Ctrl-S</kbd> save · <kbd>⌘/Ctrl-F</kbd> find</span>
	<button
		class="toggle"
		class:active={refsMode !== 'off'}
		title="Reference links: {refsLabel[refsMode]} (click to cycle)"
		aria-label="Toggle reference links"
		onclick={oncyclerefs}
	>
		{refsIcon[refsMode]}
	</button>
	<button
		class="toggle"
		class:active={findOpen}
		title="Find in tree (⌘/Ctrl-F)"
		aria-label="Find in tree"
		onclick={onfind}
	>
		⌕
	</button>
</header>

<style>
	.topbar {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.55rem 1rem;
		background: var(--color-bg-elev);
	}
	/* Fade-out divider — rules never quite touch the surface edges. */
	.topbar::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: var(--hairline);
		background: var(--grad-divider);
	}
	h1 {
		white-space: nowrap;
		font-size: 0.92rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	h1::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: var(--radius-xs);
		background: var(--color-accent);
		transform: rotate(45deg);
	}
	.proj {
		color: var(--color-muted);
		font: 400 0.72rem/1 var(--font-mono);
		overflow-wrap: anywhere;
	}
	.hint {
		color: var(--color-muted-2);
		font-size: 0.72rem;
		margin-left: auto;
	}
	kbd {
		font: 500 0.68rem var(--font-mono);
		background: var(--color-card-2);
		border: var(--hairline) solid var(--color-border);
		border-radius: var(--radius-xs);
		padding: 1px 5px;
		color: var(--color-fg-2);
	}
	.toggle {
		padding: 0.28rem 0.5rem;
		font: 500 0.85rem/1 var(--font-sans);
		border-radius: var(--radius-sm);
		border: var(--hairline) solid var(--color-border);
		background: var(--color-card-2);
		color: var(--color-fg);
		cursor: pointer;
	}
	.toggle:hover {
		background: var(--color-hover);
		border-color: var(--color-border-strong);
	}
	.toggle.active {
		border-color: var(--color-accent);
		background: var(--color-accent-soft);
		color: var(--color-accent-soft-fg);
	}
	/* no keyboard to hint at on a phone; the toggles move up to the right edge */
	@media (max-width: 768px) {
		.hint {
			display: none;
		}
		.proj {
			margin-right: auto;
		}
	}
</style>
