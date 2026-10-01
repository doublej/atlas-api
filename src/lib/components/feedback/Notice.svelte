<script lang="ts">
import type { Snippet } from 'svelte'

interface Props {
  /** `error` is announced (role="alert"); `info` and `warn` are polite. */
  tone?: 'info' | 'warn' | 'error'
  children: Snippet
  /** A trailing control — a Retry button, a link to the fix. */
  action?: Snippet
}

const { tone = 'info', children, action }: Props = $props()
</script>

<!-- Page state that stays put (a failed read, a restart that is still owed). A one-off action
     result is a toast instead. -->
<div class="notice t-small" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
  <div class="body">{@render children()}</div>
  {#if action}
    <div class="action">{@render action()}</div>
  {/if}
</div>

<style>
  .notice {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    overflow-wrap: anywhere;
  }

  .notice[data-tone='info'] {
    color: var(--color-info);
    background: var(--color-info-soft);
  }

  .notice[data-tone='warn'] {
    color: var(--color-warn);
    background: var(--color-warn-soft);
  }

  .notice[data-tone='error'] {
    color: var(--color-neg);
    background: var(--color-neg-soft);
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  /* A list of failures reads as lines, not bullets. */
  .body :global(ul) {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .action {
    flex: none;
  }
</style>
