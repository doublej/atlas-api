<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { Project } from '$lib/scanner'
import SettingsForm from './settings/SettingsForm.svelte'

interface Props {
  /** `null` closes the dialog — the same convention RenameDialog and MoveDialog use. */
  project: Project | null
  onclose: () => void
  /** Called after a successful save so the page can rescan and pick the change up. */
  onsaved: () => void
}

const { project, onclose, onsaved }: Props = $props()

let form = $state<SettingsForm>()
const saving = $derived(form?.isSaving() ?? false)

// A moved route keeps the dialog open, so the hostname pill can follow it to live.
async function save(): Promise<void> {
  if ((await form?.save()) === 'saved') onclose()
}
</script>

<Modal open={project !== null} title="Project settings" {onclose}>
  {#if project}
    <p class="t-caption muted path">{project.relativePath}</p>
    <SettingsForm {project} {onsaved} bind:this={form} />
  {/if}

  {#snippet footer()}
    <Button onclick={onclose}>Cancel</Button>
    <Button variant="primary" onclick={save} disabled={saving}>
      {saving ? 'Saving…' : 'Save'}
    </Button>
  {/snippet}
</Modal>

<style>
  .path {
    margin: 0 0 var(--space-3);
    font-family: var(--font-mono);
  }
</style>
