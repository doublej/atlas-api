<script lang="ts">
import Icon from '$lib/components/icons/Icon.svelte'
import Button from '$lib/components/ui/Button.svelte'

type ViewMode = 'table' | 'flat' | 'nested'

interface Props {
  search: string
  viewMode: ViewMode
  showFilters: boolean
  activeFilterCount: number
  onExpandAll: () => void
  onCollapseAll: () => void
  onClearFilters: () => void
}

let {
  search = $bindable(),
  viewMode = $bindable(),
  showFilters = $bindable(),
  activeFilterCount,
  onExpandAll,
  onCollapseAll,
  onClearFilters,
}: Props = $props()
</script>

<div class="toolbar">
  <div class="search">
    <Icon name="search" size={14} />
    <input type="search" bind:value={search} placeholder="Search projects" aria-label="Search projects" />
  </div>

  <div class="views" role="group" aria-label="View mode">
    <button
      type="button"
      aria-pressed={viewMode === 'table'}
      onclick={() => {
        viewMode = 'table'
      }}
    >
      <Icon name="rows" size={13} />
      Table
    </button>
    <button
      type="button"
      aria-pressed={viewMode === 'flat'}
      onclick={() => {
        viewMode = 'flat'
      }}
    >
      <Icon name="folder" size={13} />
      Cards
    </button>
    <button
      type="button"
      aria-pressed={viewMode === 'nested'}
      onclick={() => {
        viewMode = 'nested'
      }}
    >
      <Icon name="tree" size={13} />
      Nested
    </button>
  </div>

  {#if viewMode === 'nested'}
    <Button onclick={onExpandAll}>Expand all</Button>
    <Button onclick={onCollapseAll}>Collapse all</Button>
  {/if}

  <Button
    onclick={() => {
      showFilters = !showFilters
    }}
    aria-expanded={showFilters}
  >
    <Icon name="filter" size={13} />
    Filters
    {#if activeFilterCount > 0}
      <span class="count num">{activeFilterCount}</span>
    {/if}
  </Button>

  {#if activeFilterCount > 0}
    <Button onclick={onClearFilters}>Clear all</Button>
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--toolbar-gap);
    padding: var(--toolbar-py) 0;
  }

  .search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1 1 220px;
    height: 30px;
    padding: 0 var(--space-3);
    color: var(--color-muted);
    background: var(--color-card);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
    transition: border-color var(--duration-fast) var(--ease-out);
  }

  /* Focus arrives from above: soft ring plus a brighter top edge. */
  .search:focus-within {
    border-color: var(--color-accent);
    box-shadow:
      0 0 0 3px var(--color-accent-soft),
      inset 0 1px 0 var(--color-accent);
  }

  .search input {
    flex: 1;
    min-width: 0;
    font-family: inherit;
    font-size: 13px;
    color: var(--color-fg);
    background: none;
    border: none;
    outline: none;
  }

  .search input::-webkit-search-cancel-button {
    filter: grayscale(1);
    opacity: 0.5;
  }

  .views {
    display: inline-flex;
    padding: 2px;
    background: var(--color-card-2);
    border-radius: var(--radius-sm);
  }

  .views button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 26px;
    padding: 0 var(--space-2);
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted);
    background: transparent;
    border: none;
    border-radius: var(--radius-xs);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .views button[aria-pressed='true'] {
    color: var(--color-fg);
    background: var(--color-card);
    box-shadow: var(--shadow-xs);
  }

  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-size: 10px;
    color: var(--color-accent-fg);
    background: var(--color-accent);
    border-radius: var(--radius-full);
  }

  @media (max-width: 768px) {
    .search {
      height: var(--touch);
    }
  }
</style>
