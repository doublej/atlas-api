<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { Project } from '$lib/scanner'

interface Props {
  project: Project | null
  onclose: () => void
}

const { project, onclose }: Props = $props()

let title = $state('')
let description = $state('')
let priority = $state('1')
let status = $state<string | null>(null)
let saving = $state(false)

async function create(): Promise<void> {
  if (!project || saving || !title.trim()) return
  saving = true
  status = null
  const res = await fetch('/api/beads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: project.path,
      title: title.trim(),
      description: description.trim() || undefined,
      priority: Number(priority),
    }),
  })
  const body = await res.json()
  saving = false
  if (!res.ok) {
    status = body.error ?? 'could not create the ticket'
    return
  }
  title = ''
  description = ''
  onclose()
}
</script>

<Modal open={project !== null} title="New beads ticket" {onclose}>
  {#if project}
    <p class="t-caption muted path">{project.relativePath}</p>

    <label class="field">
      <span class="t-caption">Title</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={title} autofocus placeholder="what needs doing" />
    </label>

    <label class="field">
      <span class="t-caption">Description</span>
      <textarea bind:value={description} rows="4"></textarea>
    </label>

    <label class="field">
      <span class="t-caption">Priority</span>
      <select bind:value={priority}>
        <option value="0">0 — now</option>
        <option value="1">1 — normal</option>
        <option value="2">2 — later</option>
        <option value="3">3 — someday</option>
      </select>
    </label>

    {#if status}
      <p class="t-small error">{status}</p>
    {/if}
  {/if}

  {#snippet footer()}
    <Button onclick={onclose}>Cancel</Button>
    <Button variant="primary" onclick={create} disabled={saving || !title.trim()}>
      {saving ? 'Creating…' : 'Create'}
    </Button>
  {/snippet}
</Modal>

<style>
  .path {
    margin: 0 0 var(--space-3);
    font-family: var(--font-mono);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: var(--space-3);
  }

  input,
  textarea,
  select {
    padding: 6px var(--space-2);
    font-family: inherit;
    font-size: 12px;
    color: var(--color-fg);
    background: var(--color-card-2);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
    resize: vertical;
  }

  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 1px;
  }

  .error {
    margin: 0;
    color: var(--color-neg);
  }
</style>
