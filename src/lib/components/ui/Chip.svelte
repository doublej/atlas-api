<script lang="ts">
import type { Snippet } from 'svelte'

interface Props {
  pressed: boolean
  onclick: () => void
  /** Optional categorical swatch shown ahead of the label (type / framework). */
  dot?: string
  children: Snippet
}

const { pressed, onclick, dot, children }: Props = $props()
</script>

<button class="chip" type="button" aria-pressed={pressed} {onclick}>
  {#if dot}
    <span class="dot" style:background={dot}></span>
  {/if}
  {@render children()}
</button>

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 24px;
    padding: 0 var(--space-2);
    font-family: inherit;
    font-size: 12px;
    line-height: 1;
    color: var(--color-muted);
    background: transparent;
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .chip:hover {
    color: var(--color-fg);
    background: var(--color-hover);
  }

  .chip[aria-pressed='true'] {
    color: var(--color-accent-soft-fg);
    background: var(--color-accent-soft);
    border-color: transparent;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    flex: none;
  }

  @media (max-width: 768px) {
    .chip {
      min-height: 32px;
    }
  }
</style>
