<script lang="ts">
import { tick } from 'svelte'
import Icon from '$lib/components/icons/Icon.svelte'
import Button from '$lib/components/ui/Button.svelte'
import { errorMessage } from '$lib/format'
import { toast } from '$lib/toast.svelte'

/**
 * Text that turns into an input on click. Enter (or Save) calls `onsave`; Escape (or Cancel)
 * drops the draft. A failed save toasts and keeps the editor open with the draft.
 */
interface Props {
  value: string
  /** Accessible name of the input and the edit button. */
  label: string
  /** Shown when `value` is empty. */
  placeholder?: string
  /** False renders plain text: a remote project is read-only. */
  editable?: boolean
  /** `title` styles it as the page heading. */
  variant?: 'title' | 'text'
  onsave: (next: string) => Promise<unknown>
}

const {
  value,
  label,
  placeholder = '',
  editable = true,
  variant = 'text',
  onsave,
}: Props = $props()

let editing = $state(false)
let busy = $state(false)
let draft = $state('')
let input = $state<HTMLInputElement>()

async function start(): Promise<void> {
  draft = value
  editing = true
  await tick()
  input?.select()
}

async function save(): Promise<void> {
  if (busy) return
  if (draft.trim() === value.trim()) {
    editing = false
    return
  }
  busy = true
  try {
    await onsave(draft.trim())
    editing = false
  } catch (e) {
    toast(errorMessage(e), 'error')
  } finally {
    busy = false
  }
}
</script>

{#if editing}
  <span class="edit" data-variant={variant}>
    <input
      bind:this={input}
      bind:value={draft}
      aria-label={label}
      disabled={busy}
      onkeydown={(e) => {
        if (e.key === 'Enter') save()
        if (e.key === 'Escape') editing = false
      }}
    />
    <Button variant="primary" onclick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
    <Button onclick={() => (editing = false)} disabled={busy}>Cancel</Button>
  </span>
{:else if editable}
  <button class="text" data-variant={variant} type="button" onclick={start} title="Edit {label.toLowerCase()}">
    <span class:empty={!value}>{value || placeholder}</span>
    <Icon name="pencil" size={variant === 'title' ? 14 : 11} />
  </button>
{:else}
  <span class="text" data-variant={variant}><span class:empty={!value}>{value || placeholder}</span></span>
{/if}

<style>
  .text {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-2);
    max-width: 100%;
    padding: 0;
    font: inherit;
    font-size: 13px;
    text-align: left;
    color: var(--color-fg-2);
    background: none;
    border: none;
    overflow-wrap: anywhere;
  }

  button.text {
    cursor: text;
  }

  .text[data-variant='title'] {
    font-family: var(--font-display);
    font-size: 40px;
    font-weight: 400;
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: var(--color-fg);
  }

  .text :global(svg) {
    flex: none;
    color: var(--color-muted-2);
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  button.text:hover :global(svg),
  button.text:focus-visible :global(svg) {
    opacity: 1;
  }

  @media (hover: none) {
    .text :global(svg) {
      opacity: 1;
    }
  }

  .empty {
    font-style: italic;
    color: var(--color-muted-2);
  }

  .edit {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
  }

  input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 var(--space-2);
    font: inherit;
    font-size: 13px;
    color: var(--color-fg);
    background: var(--color-bg);
    border: var(--hairline) solid var(--color-accent);
    border-radius: var(--radius-sm);
  }

  /* Same face, size and left edge as the title it replaces, so the text does not jump. */
  .edit[data-variant='title'] input {
    height: auto;
    margin-left: calc(-1 * (var(--space-2) + var(--hairline)));
    font-family: var(--font-display);
    font-size: 40px;
    font-weight: 400;
    line-height: 1.05;
    letter-spacing: -0.01em;
  }
</style>
