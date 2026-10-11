<script lang="ts">
import { toggleSet } from '$lib/browser/filters'
import Chip from '$lib/components/ui/Chip.svelte'

interface Props {
  /** Most used first. */
  tags: { tag: string; count: number }[]
  selected: Set<string>
}

let { tags, selected = $bindable() }: Props = $props()

const TOP = 30
const MATCHES = 60
let query = $state('')

// ~270 tags are too many chips: the top ones show, the rest are behind the box. A picked tag
// always shows, wherever it ranks.
const shown = $derived.by(() => {
  const q = query.trim().toLowerCase()
  if (q) return tags.filter((t) => t.tag.includes(q)).slice(0, MATCHES)
  return tags.filter((t, i) => i < TOP || selected.has(t.tag))
})
const hidden = $derived(query.trim() ? 0 : tags.length - shown.length)
</script>

<div class="facet">
  <input
    class="filter"
    type="search"
    bind:value={query}
    placeholder="Filter {tags.length} tags"
    aria-label="Filter tags"
  />
  <div class="chips">
    {#each shown as { tag, count } (tag)}
      <Chip pressed={selected.has(tag)} onclick={() => (selected = toggleSet(selected, tag))}>
        {tag}<span class="count num">{count}</span>
      </Chip>
    {:else}
      <span class="t-caption">No tag matches “{query}”.</span>
    {/each}
    {#if hidden > 0}<span class="t-caption more">+{hidden} more — type to find them</span>{/if}
  </div>
</div>

<style>
  .facet {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .filter {
    width: min(100%, 16rem);
    height: 26px;
    padding: 0 var(--space-2);
    font: inherit;
    font-size: 12px;
    color: var(--color-fg);
    background: var(--color-card);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .filter:focus {
    border-color: var(--color-accent);
    outline: none;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
  }

  .count {
    margin-left: 2px;
    font-size: 10px;
    color: var(--color-muted-2);
  }

  .more {
    margin-left: var(--space-1);
  }
</style>
