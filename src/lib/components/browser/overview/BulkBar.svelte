<script lang="ts">
import * as api from '$lib/browser/api'
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte'
import TagInput from '$lib/components/tags/TagInput.svelte'
import Button from '$lib/components/ui/Button.svelte'
import { errorMessage } from '$lib/format'
import type { ProjectSummary } from '$lib/project-summary'
import { toast } from '$lib/toast.svelte'

interface Props {
  /** The selected projects — local ones only, the table never selects a remote one. */
  projects: ProjectSummary[]
  /** Tag completions, most used first. */
  vocabulary: string[]
  onclear: () => void
  /** A write landed: reload what it changed. */
  onchanged: (what: 'tags' | 'archive') => unknown
}

const { projects, vocabulary, onclear, onchanged }: Props = $props()

let draft = $state<string[]>([])
let busy = $state(false)
/** The pending archive (true) or unarchive (false), while its dialog is open. */
let archiving = $state<boolean | null>(null)

const paths = $derived(projects.map((p) => p.path))
const toArchive = $derived(projects.filter((p) => !p.archived))
const toUnarchive = $derived(projects.filter((p) => p.archived))
const targets = $derived(archiving ? toArchive : toUnarchive)
const n = $derived(projects.length === 1 ? '1 project' : `${projects.length} projects`)

async function editTags(add: boolean): Promise<void> {
  const tags = draft
  busy = true
  try {
    await api.patchTags(paths, add ? tags : [], add ? [] : tags)
    toast(
      `${add ? 'Added' : 'Removed'} ${tags.map((t) => `#${t}`).join(' ')} ${add ? 'to' : 'from'} ${n}`,
    )
    draft = []
    await onchanged('tags')
  } catch (e) {
    toast(`Tag edit failed: ${errorMessage(e)}`, 'error')
  } finally {
    busy = false
  }
}

// One at a time: an archive also drops the project's dev hostname, under the registry lock.
async function applyArchive(): Promise<void> {
  for (const p of targets) await api.setArchived(p.path, Boolean(archiving))
  toast(`${archiving ? 'Archived' : 'Unarchived'} ${targets.length} project(s)`)
  await onchanged('archive')
}

async function copyPaths(): Promise<void> {
  await navigator.clipboard.writeText(paths.join('\n'))
  toast(`Copied ${paths.length} path(s)`)
}
</script>

<div class="bar" role="region" aria-label="Bulk edit">
  <strong class="count">{n} selected</strong>
  <div class="tags">
    <TagInput tags={draft} {vocabulary} onchange={(t) => (draft = t)} placeholder="Tags to add or remove…" disabled={busy} />
  </div>
  <Button variant="primary" disabled={busy || !draft.length} onclick={() => editTags(true)}>Add tags</Button>
  <Button disabled={busy || !draft.length} onclick={() => editTags(false)}>Remove tags</Button>
  <span class="sep"></span>
  {#if toArchive.length}<Button disabled={busy} onclick={() => (archiving = true)}>Archive</Button>{/if}
  {#if toUnarchive.length}<Button disabled={busy} onclick={() => (archiving = false)}>Unarchive</Button>{/if}
  <Button onclick={copyPaths}>Copy paths</Button>
  <Button onclick={onclear} title="Clear the selection (Esc)">Clear</Button>
</div>

<ConfirmDialog
  open={archiving !== null}
  title="{archiving ? 'Archive' : 'Unarchive'} {targets.length} project(s)?"
  message={archiving
    ? 'Sets archived in each .atlas and releases its dev hostname. The folders stay where they are.'
    : 'Clears archived in each .atlas.'}
  items={targets.map((p) => p.relativePath)}
  confirmLabel={archiving ? 'Archive' : 'Unarchive'}
  onconfirm={applyArchive}
  onclose={() => (archiving = null)}
/>

<style>
  .bar {
    position: sticky;
    bottom: var(--space-4);
    z-index: 40;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--color-card);
    border: var(--hairline) solid var(--color-accent);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
  }

  .count {
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }

  .tags {
    flex: 1 1 18rem;
    min-width: 12rem;
  }

  .sep {
    width: var(--hairline);
    height: 20px;
    background: var(--color-border);
  }
</style>
