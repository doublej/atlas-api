<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import { errorMessage } from '$lib/format'
import Notice from './Notice.svelte'

interface Props {
  open: boolean
  title: string
  message?: string
  /** What the action touches, one line each, in a scrolling list. */
  items?: string[]
  confirmLabel?: string
  /** Red confirm button, for anything that deletes, kills or discards. */
  danger?: boolean
  /** The action. The dialog shows it busy until it settles, closes on success, and shows the
   *  error and stays open on failure. */
  onconfirm: () => unknown
  /** Cancel, Escape, or a confirm that succeeded. */
  onclose: () => void
}

const {
  open,
  title,
  message,
  items = [],
  confirmLabel = 'Confirm',
  danger = false,
  onconfirm,
  onclose,
}: Props = $props()

let busy = $state(false)
let error = $state('')
/** Bumped by every close. An action that settles after its dialog closed — a second Escape in a
 *  row gets past the cancel block in Chrome — then leaves the next dialog alone. */
let generation = 0

function close() {
  generation++
  busy = false
  error = ''
  onclose()
}

/** A running action cannot be cancelled, so Escape waits for it like the Cancel button does. */
function cancel(e: Event) {
  if (busy) e.preventDefault()
}

async function confirm() {
  const mine = generation
  busy = true
  error = ''
  try {
    await onconfirm()
    if (mine === generation) close()
  } catch (e) {
    if (mine !== generation) return
    error = errorMessage(e)
    busy = false
  }
}
</script>

<Modal {open} {title} onclose={close} oncancel={cancel}>
  {#if message}<p class="t-small">{message}</p>{/if}
  {#if items.length}
    <ul class="items mono t-small">
      {#each items as item, i (i)}<li>{item}</li>{/each}
    </ul>
  {/if}
  {#if error}<Notice tone="error">{error}</Notice>{/if}
  {#snippet footer()}
    <!-- The safe choice takes the focus, so Enter right after opening never confirms. -->
    <Button autofocus disabled={busy} onclick={close}>Cancel</Button>
    <Button variant={danger ? 'danger' : 'primary'} disabled={busy} onclick={confirm}>
      {busy ? 'Working…' : confirmLabel}
    </Button>
  {/snippet}
</Modal>

<style>
  .items {
    max-height: 40vh;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    overflow: auto;
    list-style: none;
    background: var(--color-card-2);
    border-radius: var(--radius-sm);
    overflow-wrap: anywhere;
  }
</style>
