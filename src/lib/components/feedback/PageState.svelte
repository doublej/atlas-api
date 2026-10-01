<script lang="ts">
import type { Snippet } from 'svelte'
import Button from '$lib/components/ui/Button.svelte'
import Notice from './Notice.svelte'

interface Props {
  /** The first load is in flight: one muted line instead of the content. */
  loading?: boolean
  loadingText?: string
  /** A failed read, shown above the content — or alone, when there is no content. */
  error?: string | null
  /** Adds a Retry button to the error. */
  onretry?: () => void
  /** Nothing to show and nothing failed. */
  empty?: boolean
  /** What would be here, and how to get it. */
  emptyText?: string
  /** A control after the empty text — Rescan, Scan. */
  emptyAction?: Snippet
  children?: Snippet
}

const {
  loading = false,
  loadingText = 'Loading…',
  error,
  onretry,
  empty = false,
  emptyText = 'Nothing here yet.',
  emptyAction,
  children,
}: Props = $props()
</script>

{#snippet retry()}
  <Button onclick={onretry}>Retry</Button>
{/snippet}

{#if error}
  <Notice tone="error" action={onretry ? retry : undefined}>{error}</Notice>
{/if}
{#if loading}
  <p class="t-small muted" aria-busy="true">{loadingText}</p>
{:else if empty}
  {#if !error}
    <div class="empty">
      <p class="t-small muted">{emptyText}</p>
      {@render emptyAction?.()}
    </div>
  {/if}
{:else}
  {@render children?.()}
{/if}

<style>
  .empty {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
</style>
