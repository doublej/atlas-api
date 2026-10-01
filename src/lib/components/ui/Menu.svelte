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

const id = $props.id()
const MAX_HEIGHT = 320
const GAP = 4

let open = $state(false)
let button = $state<HTMLButtonElement>()
let popover = $state<HTMLDivElement>()
/** Fixed to the viewport next to the trigger: the popover lives in the top layer, so no
 *  scrolling or clipping ancestor (a table frame, a card) can cut it off. */
let place = $state({ top: 'auto', bottom: 'auto', left: 'auto', right: 'auto', maxHeight: '' })

const close = (): void => {
  popover?.hidePopover()
}

/** Opens below the trigger, or above it when there is more room there. */
function onbeforetoggle(event: ToggleEvent): void {
  open = event.newState === 'open'
  if (!open || !button) return
  const r = button.getBoundingClientRect()
  const below = window.innerHeight - r.bottom - GAP * 2
  const above = r.top - GAP * 2
  const up = below < MAX_HEIGHT && above > below
  place = {
    top: up ? 'auto' : `${r.bottom + GAP}px`,
    bottom: up ? `${window.innerHeight - r.top + GAP}px` : 'auto',
    left: align === 'start' ? `${r.left}px` : 'auto',
    right: align === 'end' ? `${document.documentElement.clientWidth - r.right}px` : 'auto',
    maxHeight: `${Math.min(MAX_HEIGHT, up ? above : below)}px`,
  }
}

// A fixed popover would stay put while its trigger scrolls away: close it instead.
$effect(() => {
  if (!open) return
  const onScroll = (event: Event): void => {
    if (!popover?.contains(event.target as Node)) close()
  }
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', close)
  return () => {
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', close)
  }
})
</script>

<div class="menu">
  <button
    bind:this={button}
    class="trigger"
    type="button"
    aria-label={label}
    aria-expanded={open}
    aria-haspopup="menu"
    popovertarget={id}
  >
    {@render trigger()}
  </button>

  <!-- popover="auto": Escape and a click outside close it; the trigger toggles it. -->
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <div
    bind:this={popover}
    {id}
    class="popover"
    popover="auto"
    role="menu"
    tabindex="-1"
    style:top={place.top}
    style:bottom={place.bottom}
    style:left={place.left}
    style:right={place.right}
    style:max-height={place.maxHeight}
    {onbeforetoggle}
  >
    {#if open}{@render children(close)}{/if}
  </div>
</div>

<style>
  .menu {
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
    position: fixed;
    inset: auto;
    margin: 0;
    min-width: 160px;
    overflow-y: auto;
    padding: var(--space-1);
    color: inherit;
    background: var(--color-bg-elev);
    border: var(--hairline) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  @media (max-width: 768px) {
    .trigger {
      min-height: var(--touch);
    }
  }
</style>
