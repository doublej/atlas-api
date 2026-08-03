<script lang="ts">
import type { Snippet } from 'svelte'

interface Props {
  /** Accessible name for the trigger button. */
  label: string
  trigger: Snippet
  /** Menu body; receives `close` so items can dismiss the popover. */
  children: Snippet<[() => void]>
  align?: 'start' | 'end'
}

const { label, trigger, children, align = 'end' }: Props = $props()

let open = $state(false)
let root = $state<HTMLDivElement>()

const close = (): void => {
  open = false
}

$effect(() => {
  if (!open) return
  const onPointerDown = (event: MouseEvent): void => {
    if (root && !root.contains(event.target as Node)) close()
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') close()
  }
  document.addEventListener('mousedown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  return () => {
    document.removeEventListener('mousedown', onPointerDown)
    document.removeEventListener('keydown', onKeyDown)
  }
})
</script>

<div class="menu" bind:this={root}>
  <button
    class="trigger"
    type="button"
    aria-label={label}
    aria-expanded={open}
    aria-haspopup="menu"
    onclick={() => {
      open = !open
    }}
  >
    {@render trigger()}
  </button>

  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
    <div class="popover" data-align={align} role="menu" tabindex="-1">
      {@render children(close)}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    display: inline-flex;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 26px;
    padding: 0 var(--space-2);
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-fg-2);
    background: var(--color-card);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-out);
  }

  .trigger:hover,
  .trigger[aria-expanded='true'] {
    background: var(--color-hover);
    color: var(--color-fg);
  }

  /* Floating surfaces are the one place shadows are allowed. */
  .popover {
    position: absolute;
    top: calc(100% + var(--space-1));
    z-index: 40;
    min-width: 160px;
    max-height: 320px;
    overflow-y: auto;
    padding: var(--space-1);
    background: var(--color-bg-elev);
    border: var(--hairline) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .popover[data-align='end'] {
    right: 0;
  }
  .popover[data-align='start'] {
    left: 0;
  }

  @media (max-width: 768px) {
    .trigger {
      min-height: var(--touch);
    }
  }
</style>
