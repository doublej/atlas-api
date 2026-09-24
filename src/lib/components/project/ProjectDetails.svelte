<script lang="ts">
import * as api from '$lib/browser/api'
import Icon from '$lib/components/icons/Icon.svelte'
import Button from '$lib/components/ui/Button.svelte'
import type { Project } from '$lib/scanner'

interface Props {
  project: Project
}

const { project }: Props = $props()

// Description editing and the README disclosure are per-row concerns, so the
// state lives here rather than as page-level singletons.
let editing = $state(false)
// Projects are plain objects (not deep state), so a saved edit shows through this.
let description = $derived(project.description)
let draft = $state('')
let readmeOpen = $state(false)
let readmeText = $state<string | null>(null)
let readmeLoading = $state(false)

function startEdit(): void {
  draft = description ?? ''
  editing = true
}

async function save(): Promise<void> {
  await api.saveDescription(project.path, draft)
  project.description = draft
  description = draft
  editing = false
}

async function toggleReadme(): Promise<void> {
  readmeOpen = !readmeOpen
  if (!readmeOpen || readmeText !== null) return
  readmeLoading = true
  readmeText = await api.fetchReadme(project.path)
  readmeLoading = false
}
</script>

<div class="details">
  {#if editing}
    <div class="edit">
      <input
        type="text"
        bind:value={draft}
        aria-label="Project description"
        onkeydown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') editing = false
        }}
      />
      <Button onclick={save}>Save</Button>
      <Button
        onclick={() => {
          editing = false
        }}
      >
        Cancel
      </Button>
    </div>
  {:else}
    <!-- Double-click to edit matches the previous UI; the pencil is the discoverable path. -->
    <p class="desc" class:empty={!description} ondblclick={startEdit}>
      {description || 'No description'}
    </p>
    <button class="edit-btn" type="button" onclick={startEdit} aria-label="Edit description">
      <Icon name="pencil" size={11} />
    </button>
  {/if}

  {#if project.readme}
    <button class="readme-btn" type="button" onclick={toggleReadme} aria-expanded={readmeOpen}>
      <Icon name={readmeOpen ? 'chevronDown' : 'chevronRight'} size={11} />
      README
    </button>
  {/if}
</div>

{#if readmeOpen}
  {#if readmeLoading}
    <p class="readme-state t-caption">Loading</p>
  {:else if readmeText}
    <pre class="readme">{readmeText}</pre>
  {:else}
    <p class="readme-state t-caption">README could not be read</p>
  {/if}
{/if}

<style>
  .details {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .desc {
    margin: 0;
    font-size: 12px;
    color: var(--color-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .desc.empty {
    color: var(--color-muted-2);
    font-style: italic;
  }

  .edit-btn,
  .readme-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    flex: none;
    padding: 2px 4px;
    font-family: inherit;
    font-size: 11px;
    color: var(--color-muted-2);
    background: none;
    border: none;
    border-radius: var(--radius-xs);
    cursor: pointer;
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .readme-btn {
    opacity: 1;
  }

  .edit-btn:hover,
  .readme-btn:hover {
    color: var(--color-fg);
    background: var(--color-hover);
  }

  /* The pencil only appears once the row is engaged — quiet by default. */
  :global(.row:hover) .edit-btn,
  :global(.row:focus-within) .edit-btn {
    opacity: 1;
  }

  .edit {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .edit input {
    flex: 1;
    min-width: 0;
    height: 24px;
    padding: 0 var(--space-2);
    font-family: inherit;
    font-size: 12px;
    color: var(--color-fg);
    background: var(--color-bg);
    border: var(--hairline) solid var(--color-border-strong);
    border-radius: var(--radius-xs);
  }

  .readme {
    max-height: 300px;
    margin: var(--space-2) 0 0;
    padding: var(--space-3);
    overflow: auto;
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    color: var(--color-fg-2);
    background: var(--color-card-2);
    border-radius: var(--radius-sm);
  }

  .readme-state {
    margin: var(--space-2) 0 0;
  }
</style>
