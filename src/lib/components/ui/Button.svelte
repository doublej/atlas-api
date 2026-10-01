<script lang="ts">
import type { Snippet } from 'svelte'
import type { HTMLButtonAttributes } from 'svelte/elements'

interface Props extends HTMLButtonAttributes {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  children: Snippet
}

const { variant = 'ghost', size = 'sm', children, ...rest }: Props = $props()
</script>

<button class="btn" data-variant={variant} data-size={size} type="button" {...rest}>
  {@render children()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: inherit;
    font-weight: 500;
    white-space: nowrap;
    border-radius: var(--radius-sm);
    border: var(--hairline) solid var(--color-border);
    background: var(--color-card);
    color: var(--color-fg-2);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out),
      border-color var(--duration-fast) var(--ease-out);
  }

  .btn[data-size='sm'] {
    height: 26px;
    padding: 0 var(--space-2);
    font-size: 12px;
  }

  .btn[data-size='md'] {
    height: 32px;
    padding: 0 var(--space-3);
    font-size: 13px;
  }

  .btn:hover:not(:disabled) {
    background: var(--color-hover);
    color: var(--color-fg);
  }

  .btn:active:not(:disabled) {
    transform: translateY(0.5px);
  }

  /* Primary carries the catch-light border: white-tinted top, dark-tinted bottom. */
  .btn[data-variant='primary'] {
    background: var(--color-accent);
    color: var(--color-accent-fg);
    border-color: transparent;
    box-shadow: var(--hairline-highlight);
  }

  .btn[data-variant='primary']:hover:not(:disabled) {
    background: var(--color-accent);
    color: var(--color-accent-fg);
    filter: brightness(0.96);
  }

  :global(.dark) .btn[data-variant='primary']:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .btn[data-variant='danger'] {
    color: var(--color-neg);
  }

  .btn[data-variant='danger']:hover:not(:disabled) {
    background: var(--color-neg-soft);
    color: var(--color-neg);
  }

  /* After the variants (same specificity), so a disabled primary or danger button looks it. */
  .btn:disabled {
    color: var(--color-disabled);
    background: var(--color-card);
    border-color: var(--color-border);
    box-shadow: none;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .btn {
      min-height: var(--touch);
    }
  }
</style>
