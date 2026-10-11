<script lang="ts">
import { STATE_TAGS } from '$lib/browser/filters'
import Chip from '$lib/components/ui/Chip.svelte'

interface Props {
  /** Tag → how many projects carry it. */
  counts: Map<string, number>
  /** The tag filter; a state chip swaps the state tag in it and keeps the other tags. */
  selected: Set<string>
}

let { counts, selected = $bindable() }: Props = $props()

const DOTS: Record<string, string> = {
  active: 'var(--color-pos)',
  parked: 'var(--color-warn)',
  dormant: 'var(--color-muted-2)',
  archived: 'var(--color-disabled)',
}

// One state at a time: tags AND together, and no project is both parked and active.
function pick(state: string): void {
  const next = new Set([...selected].filter((t) => !(STATE_TAGS as readonly string[]).includes(t)))
  if (!selected.has(state)) next.add(state)
  selected = next
}
</script>

<div class="states" role="group" aria-label="Project state">
  {#each STATE_TAGS as state (state)}
    <Chip pressed={selected.has(state)} dot={DOTS[state]} onclick={() => pick(state)}>
      {state}<span class="count num">{counts.get(state) ?? 0}</span>
    </Chip>
  {/each}
</div>

<style>
  .states {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .count {
    margin-left: 2px;
    font-size: 10px;
    color: var(--color-muted-2);
  }
</style>
