<script lang="ts">
import { normalizeTags } from '$lib/tag-normalize'

interface Props {
  tags: string[]
  /** Existing tags offered as completions, most used first. */
  vocabulary?: string[]
  /** Called with the full new list after every add or remove. */
  onchange: (tags: string[]) => void
  placeholder?: string
  disabled?: boolean
}

const {
  tags,
  vocabulary = [],
  onchange,
  placeholder = 'Add tag…',
  disabled = false,
}: Props = $props()

const listId = `tags-${Math.random().toString(36).slice(2, 8)}`
let draft = $state('')
const suggestions = $derived(vocabulary.filter((t) => !tags.includes(t)))

function commit(): void {
  const added = normalizeTags(draft.split(/[,\s]+/))
  draft = ''
  if (added.some((t) => !tags.includes(t))) onchange(normalizeTags([...tags, ...added]))
}

function remove(tag: string): void {
  onchange(tags.filter((t) => t !== tag))
}

function onkeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    commit()
  } else if (e.key === 'Backspace' && !draft && tags.length) {
    remove(tags[tags.length - 1])
  }
}
</script>

<div class="tag-input" class:disabled>
  {#each tags as tag (tag)}
    <span class="tag">
      #{tag}
      <button type="button" aria-label="Remove tag {tag}" {disabled} onclick={() => remove(tag)}>×</button>
    </span>
  {/each}
  <input
    bind:value={draft}
    {onkeydown}
    onblur={commit}
    list={listId}
    {placeholder}
    {disabled}
    aria-label="Add tag"
    autocomplete="off"
    spellcheck="false"
  />
  <datalist id={listId}>
    {#each suggestions as tag (tag)}
      <option value={tag}></option>
    {/each}
  </datalist>
</div>

<style>
  .tag-input {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    min-height: 32px;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-elev);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .tag-input:focus-within {
    border-color: var(--color-accent);
  }

  .tag-input.disabled {
    opacity: 0.6;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 22px;
    padding: 0 2px 0 var(--space-2);
    font-size: 12px;
    color: var(--color-accent-soft-fg);
    background: var(--color-accent-soft);
    border-radius: var(--radius-full);
  }

  .tag button {
    width: 18px;
    height: 18px;
    padding: 0;
    font: inherit;
    line-height: 1;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: var(--radius-full);
    cursor: pointer;
  }

  .tag button:hover {
    background: var(--color-hover);
  }

  input {
    flex: 1;
    min-width: 96px;
    height: 22px;
    padding: 0;
    font: inherit;
    font-size: 13px;
    color: var(--color-fg);
    background: transparent;
    border: 0;
    outline: none;
  }
</style>
