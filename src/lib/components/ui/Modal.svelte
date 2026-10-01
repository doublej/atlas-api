<script lang="ts">
import type { Snippet } from 'svelte'

interface Props {
  open: boolean
  title: string
  onclose: () => void
  /** Escape, before the dialog closes; `preventDefault()` keeps it open. */
  oncancel?: (e: Event) => void
  /** Room for tables and previews (the /disk plans) instead of a short form. */
  wide?: boolean
  children: Snippet
  footer: Snippet
}

const { open, title, onclose, oncancel, wide = false, children, footer }: Props = $props()

let dialog = $state<HTMLDialogElement>()

// Native <dialog> gives us the backdrop, focus trap and Escape handling, so
// the a11y work here is just keeping the DOM state in sync with the prop.
$effect(() => {
  if (!dialog) return
  if (open && !dialog.open) dialog.showModal()
  if (!open && dialog.open) dialog.close()
})
</script>

<dialog bind:this={dialog} class:wide {onclose} {oncancel} aria-label={title}>
  <h2 class="t-h3">{title}</h2>
  <div class="body">
    {@render children()}
  </div>
  <div class="actions">
    {@render footer()}
  </div>
</dialog>

<style>
  dialog {
    width: min(420px, calc(100vw - var(--space-8)));
    padding: var(--card-pad);
    color: var(--color-fg);
    background: var(--color-bg-elev);
    border: var(--hairline) solid var(--color-border-strong);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  dialog.wide {
    width: min(760px, calc(100vw - var(--space-8)));
    max-height: calc(100vh - var(--space-16));
  }

  dialog::backdrop {
    background: var(--color-overlay);
  }

  h2 {
    margin: 0 0 var(--space-4);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-5);
  }
</style>
