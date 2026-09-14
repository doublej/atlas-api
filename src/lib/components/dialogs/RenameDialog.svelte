<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { Project } from '$lib/scanner'

interface Props {
  project: Project | null
  onCancel: () => void
  onConfirm: (newName: string) => void
}

const { project, onCancel, onConfirm }: Props = $props()

let value = $state('')

$effect(() => {
  value = project?.name ?? ''
})
</script>

<Modal
  open={Boolean(project)}
  title={project ? `Rename ${project.name}` : 'Rename'}
  onclose={onCancel}
>
  <input
    type="text"
    bind:value
    aria-label="New project name"
    onkeydown={(e) => {
      if (e.key === 'Enter' && value) onConfirm(value)
    }}
  />
  {#snippet footer()}
    <Button onclick={onCancel}>Cancel</Button>
    <Button variant="primary" disabled={!value} onclick={() => onConfirm(value)}>Rename</Button>
  {/snippet}
</Modal>

<style>
  input {
    width: 100%;
    height: 32px;
    padding: 0 var(--space-3);
    font-family: inherit;
    font-size: 13px;
    color: var(--color-fg);
    background: var(--color-bg);
    border: var(--hairline) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
  }

  input:focus-visible {
    border-color: var(--color-accent);
  }
</style>
