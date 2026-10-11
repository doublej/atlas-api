<script lang="ts">
import SettingsForm from '$lib/components/dialogs/settings/SettingsForm.svelte'
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte'
import Notice from '$lib/components/feedback/Notice.svelte'
import TagInput from '$lib/components/tags/TagInput.svelte'
import Button from '$lib/components/ui/Button.svelte'
import type { Project } from '$lib/scanner'
import Section from './parts/Section.svelte'

interface Props {
  project: Project
  tags: string[]
  vocabulary: string[]
  ontags: (tags: string[]) => void
  /** After a successful save of the form. */
  onsaved: () => void
  onrename: () => void
  onmove: () => void
  onarchive: (archived: boolean) => Promise<unknown>
}

const { project, tags, vocabulary, ontags, onsaved, onrename, onmove, onarchive }: Props = $props()

let form = $state<SettingsForm>()
let archiving = $state(false)
const dirty = $derived(form?.isDirty() ?? false)
const saving = $derived(form?.isSaving() ?? false)
const archived = $derived(project.archived === true)
</script>

<Section id="settings" title="Settings">
  {#snippet actions()}
    {#if project.isLocal}
      {#if dirty}<span class="dirty t-caption" role="status">Unsaved changes</span>{/if}
      <Button onclick={() => form?.reset()} disabled={!dirty || saving}>Reset</Button>
      <Button variant="primary" onclick={() => form?.save()} disabled={!dirty || saving}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    {/if}
  {/snippet}

  {#if !project.isLocal}
    <Notice>This project lives on {project.host}. Settings are edited on the machine that holds it.</Notice>
  {:else}
    <SettingsForm {project} {onsaved} bind:this={form} />

    <h3>Tags <span class="muted-2">— saved as you change them</span></h3>
    <TagInput {tags} {vocabulary} onchange={ontags} />

    <h3>Folder</h3>
    <div class="danger">
      <Button onclick={onrename}>Rename…</Button>
      <Button onclick={onmove}>Move…</Button>
      <Button variant={archived ? 'ghost' : 'danger'} onclick={() => (archiving = true)}>
        {archived ? 'Unarchive' : 'Archive'}
      </Button>
      <span class="t-caption muted-2">
        Rename and move take the dev hostname along; archive also releases it.
      </span>
    </div>
  {/if}
</Section>

<ConfirmDialog
  open={archiving}
  title="{archived ? 'Unarchive' : 'Archive'} {project.name}?"
  message={archived
    ? 'It shows in the project list again.'
    : 'It drops out of the project list and its dev hostname is released. Nothing on disk is deleted.'}
  confirmLabel={archived ? 'Unarchive' : 'Archive'}
  danger={!archived}
  onconfirm={() => onarchive(!archived)}
  onclose={() => (archiving = false)}
/>

<style>
  .dirty {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--color-warn);
  }

  .dirty::before {
    width: 6px;
    height: 6px;
    content: '';
    background: var(--color-warn);
    border-radius: var(--radius-full);
  }

  .danger {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
</style>
