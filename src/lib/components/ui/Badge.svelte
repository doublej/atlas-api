<script lang="ts">
import type { Snippet } from 'svelte'

interface Props {
  tone?: 'neutral' | 'accent' | 'pos' | 'neg' | 'warn' | 'info'
  /** Categorical swatch (type / framework colour) rendered as a leading dot. */
  dot?: string
  title?: string
  children: Snippet
}

const { tone = 'neutral', dot, title, children }: Props = $props()
</script>

<span class="badge" data-tone={tone} {title}>
  {#if dot}
    <span class="dot" style:background={dot}></span>
  {/if}
  {@render children()}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 18px;
    padding: 0 6px;
    font-size: 11px;
    line-height: 1;
    white-space: nowrap;
    border-radius: var(--radius-xs);
    border: var(--hairline) solid var(--color-border);
    color: var(--color-muted);
  }

  .badge[data-tone='accent'] {
    color: var(--color-accent-soft-fg);
    background: var(--color-accent-soft);
    border-color: transparent;
  }
  .badge[data-tone='pos'] {
    color: var(--color-pos);
    background: var(--color-pos-soft);
    border-color: transparent;
  }
  .badge[data-tone='neg'] {
    color: var(--color-neg);
    background: var(--color-neg-soft);
    border-color: transparent;
  }
  .badge[data-tone='warn'] {
    color: var(--color-warn);
    background: var(--color-warn-soft);
    border-color: transparent;
  }
  .badge[data-tone='info'] {
    color: var(--color-info);
    background: var(--color-info-soft);
    border-color: transparent;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: var(--radius-full);
    flex: none;
  }
</style>
