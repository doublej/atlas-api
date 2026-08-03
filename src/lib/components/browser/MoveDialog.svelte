<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { Project } from '$lib/scanner'

interface Props {
  project: Project | null
  folders: string[]
  onCancel: () => void
  onConfirm: (targetFolder: string) => void
}

const { project, folders, onCancel, onConfirm }: Props = $props()

let target = $state('')

$effect(() => {
  if (project) target = ''
})
</script>

<Modal
  open={Boolean(project)}
  title={project ? `Move ${project.name}` : 'Move'}
  onclose={onCancel}
>
  <select bind:value={target} aria-label="Destination folder">
    <option value="">Select a folder</option>
    {#each folders as folder (folder)}
      <option value={folder}>{folder}</option>
    {/each}
  </select>
  {#snippet footer()}
    <Button onclick={onCancel}>Cancel</Button>
    <Button variant="primary" disabled={!target} onclick={() => onConfirm(target)}>Move</Button>
  {/snippet}
</Modal>

<style>
  select {
    width: 100%;
    height: 32px;
    padding: 0 var(--space-2);
    font-family: inherit;
    font-size: 13px;
    color: var(--color-fg);
    background: var(--color-bg);
    border: var(--hairline) solid var(--color-border-strong);
    border-radius: var(--radius-sm);
  }
</style>
