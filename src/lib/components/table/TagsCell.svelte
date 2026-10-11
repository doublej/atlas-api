<script lang="ts">
import { STATE_TAGS } from '$lib/browser/filters'

interface Props {
  tags: string[]
  /** Tags the list filters on now: their chips read pressed. */
  active: Set<string>
  /** A chip click toggles that tag's filter. */
  ontag: (tag: string) => void
}

const { tags, active, ontag }: Props = $props()

const SHOWN = 3
const STATES: readonly string[] = STATE_TAGS
// The state tag is the Name cell's dot already.
const own = $derived(tags.filter((t) => !STATES.includes(t)))
</script>

<span class="tags" title={own.join(', ')}>
  {#each own.slice(0, SHOWN) as tag (tag)}
    <button type="button" class="tag" aria-pressed={active.has(tag)} onclick={() => ontag(tag)}>{tag}</button>
  {/each}
  {#if own.length > SHOWN}<span class="more">+{own.length - SHOWN}</span>{/if}
</span>

<style>
  .tags {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    overflow: hidden;
  }

  .tag {
    flex: none;
    height: 18px;
    padding: 0 6px;
    font: inherit;
    font-size: 11px;
    line-height: 1;
    color: var(--color-muted);
    background: transparent;
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-full);
    cursor: pointer;
  }

  .tag:hover {
    color: var(--color-fg);
    background: var(--color-hover);
  }

  .tag[aria-pressed='true'] {
    color: var(--color-accent-soft-fg);
    background: var(--color-accent-soft);
    border-color: transparent;
  }

  .more {
    flex: none;
    font-size: 11px;
    color: var(--color-muted-2);
  }
</style>
