<script lang="ts">
import type { TemplateAdoption } from '$lib/adoption'
import type { RailItem } from './rail'

let {
  items,
  adoption,
  selectedId,
  onselect,
}: {
  items: RailItem[]
  adoption: Record<string, TemplateAdoption>
  selectedId: string | null
  onselect: (id: string) => void
} = $props()

const families = $derived([...new Set(items.map((i) => i.family))].sort())
</script>

<aside class="rail">
  <div class="rail-header">
    <h1>Templates</h1>
    <span class="count">{items.length}</span>
  </div>
  {#each families as family (family)}
    <div class="family">
      <div class="family-label">{family}</div>
      {#each items.filter((i) => i.family === family) as item (item.id)}
        <button
          type="button"
          class="rail-item"
          class:active={item.id === selectedId}
          onclick={() => onselect(item.id)}
        >
          <span class="dot" data-status={item.status}></span>
          {item.name}
          {#if adoption[item.id]?.behindCount}
            <span class="behind-count">{adoption[item.id].behindCount} behind</span>
          {/if}
        </button>
      {/each}
    </div>
  {/each}
</aside>

<style>
  .rail {
    border-right: var(--hairline) solid var(--color-border);
    overflow-y: auto;
    padding: var(--space-4);
  }

  .rail-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .rail-header h1 {
    font-size: 14px;
    font-weight: 600;
  }
  .count {
    color: var(--color-muted);
    font-size: 12px;
  }

  .family {
    margin-bottom: var(--space-3);
  }
  .family-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted-2);
    padding: var(--space-1) var(--space-2);
  }

  .rail-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    padding: 6px var(--space-2);
    border-radius: var(--radius-sm);
    background: transparent;
    border: none;
    color: var(--color-fg-2);
    font-size: 13px;
    cursor: pointer;
  }
  .rail-item:hover {
    background: var(--color-hover);
  }
  .rail-item.active {
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-fg);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    flex: none;
  }
  .dot[data-status='error'] {
    background: var(--color-neg);
  }
  .dot[data-status='warn'] {
    background: var(--color-warn);
  }
  .dot[data-status='clean'] {
    background: var(--color-pos);
  }

  .behind-count {
    margin-left: auto;
    font-size: 10px;
    color: var(--color-warn);
  }

  /* narrow screens: the rail sits above the detail, capped so the detail stays in view */
  @media (max-width: 768px) {
    .rail {
      border-right: 0;
      border-bottom: var(--hairline) solid var(--color-border);
      max-height: 40vh;
    }
  }
</style>
