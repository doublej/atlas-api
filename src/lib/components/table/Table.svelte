<script lang="ts" generics="T, K extends string | number">
import type { Snippet } from 'svelte'
import Icon from '$lib/components/icons/Icon.svelte'
import type { Selection } from '$lib/selection.svelte'
import { type Column, type RowState, rowKeyAction } from '$lib/table'
import { sortRows, TableSort } from '$lib/table-sort.svelte'

interface Props {
  /** The table's accessible name. */
  label: string
  rows: T[]
  /** A stable id per row: the each-key, the selection key and the expanded key. */
  key: (row: T) => K
  columns: Column<T>[]
  /** Pass one to share it between sibling tables or to open on a column; else the table owns one. */
  sort?: TableSort<string>
  /** Adds a checkbox column, click selection and `x`/Space. */
  selection?: Selection<K>
  /** Every visible id across sibling tables, so a shift-click range can cross them. */
  order?: K[]
  /** The row's name for its checkbox label. Default: the key. */
  rowLabel?: (row: T) => string
  /** Rows drawn faded: skipped, nested, refused. */
  dim?: (row: T) => boolean
  /** Shown full width under an opened row. Enter opens it; so does a click without `selection`. */
  expanded?: Snippet<[T]>
  /** The body when there are no rows. */
  empty?: Snippet
  /** Caps the height (any CSS length); the header then sticks while the rows scroll. */
  maxHeight?: string
}

const {
  label,
  rows,
  key,
  columns,
  sort: sortProp,
  selection,
  order,
  rowLabel,
  dim,
  expanded,
  empty,
  maxHeight,
}: Props = $props()

const ownSort = new TableSort<string>()
const sort = $derived(sortProp ?? ownSort)
const sorter = $derived(columns.find((c) => c.key === sort.key)?.sort)
const sorted = $derived(sorter ? sortRows(rows, sorter, sort.descending) : rows)
const keys = $derived(sorted.map(key))
const span = $derived(columns.length + (selection ? 1 : 0))
const allOn = $derived(keys.length > 0 && keys.every((k) => selection?.has(k)))
const someOn = $derived(!allOn && keys.some((k) => selection?.has(k)))

let open = $state<K | null>(null)
/** The one row in the tab order (roving focus). */
let focusIndex = $state(0)
let tbody = $state<HTMLTableSectionElement>()

const INTERACTIVE = 'a, button, input, select, textarea, label, summary'

function toggleOpen(k: K) {
  open = open === k ? null : k
}

function rowState(k: K): RowState {
  return { selected: selection?.has(k) ?? false, open: open === k, toggleOpen: () => toggleOpen(k) }
}

function focusRow(i: number) {
  focusIndex = i
  tbody?.querySelectorAll<HTMLTableRowElement>(':scope > tr[data-row]')[i]?.focus()
}

function onRowClick(e: MouseEvent, k: K) {
  if ((e.target as Element).closest(INTERACTIVE)) return
  if (selection) selection.click(k, e, order ?? keys)
  else if (expanded) toggleOpen(k)
}

function onRowKey(e: KeyboardEvent, i: number, k: K) {
  if (e.target !== e.currentTarget) return
  const action = rowKeyAction(e, i, sorted.length)
  if (action?.kind === 'move') focusRow(action.index)
  else if (action?.kind === 'toggle' && selection) selection.toggle(k)
  else if (action?.kind === 'expand' && expanded) toggleOpen(k)
  else return
  e.preventDefault()
}
</script>

<div class="frame" style:max-height={maxHeight}>
  <table aria-label={label}>
    <thead>
      <tr>
        {#if selection}
          <th class="check">
            <input
              type="checkbox"
              aria-label="Select all rows"
              checked={allOn}
              indeterminate={someOn}
              onchange={(e) => selection.set(keys, e.currentTarget.checked)}
            />
          </th>
        {/if}
        {#each columns as c (c.key)}
          {@const active = sort.key === c.key}
          <th
            data-align={c.align}
            data-hide={c.hideBelow}
            aria-sort={c.sort ? (active ? (sort.descending ? 'descending' : 'ascending') : 'none') : undefined}
          >
            {#if c.sort}
              <button type="button" onclick={() => sort.by(c.key)}>
                <span class:sr-only={c.hideLabel}>{c.label}</span>
                {#if active}<Icon name="chevronDown" size={10} />{/if}
              </button>
            {:else}
              <span class:sr-only={c.hideLabel}>{c.label}</span>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody bind:this={tbody}>
      {#each sorted as row, i (key(row))}
        {@const k = keys[i]}
        {@const state = rowState(k)}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex — rows are the roving-focus targets; every action also has a checkbox or button -->
        <tr
          data-row
          tabindex={i === Math.min(focusIndex, sorted.length - 1) ? 0 : -1}
          class:selected={state.selected}
          class:dim={dim?.(row)}
          aria-expanded={expanded ? state.open : undefined}
          onclick={(e) => onRowClick(e, k)}
          onkeydown={(e) => onRowKey(e, i, k)}
          onfocus={() => (focusIndex = i)}
        >
          {#if selection}
            <td class="check">
              <input
                type="checkbox"
                aria-label="Select {rowLabel?.(row) ?? k}"
                checked={state.selected}
                onchange={() => selection.toggle(k)}
              />
            </td>
          {/if}
          {#each columns as c (c.key)}
            <td data-align={c.align} data-hide={c.hideBelow} class:wrap={c.wrap}>
              {@render c.cell(row, state)}
            </td>
          {/each}
        </tr>
        {#if expanded && state.open}
          <tr class="expanded"><td colspan={span}>{@render expanded(row)}</td></tr>
        {/if}
      {:else}
        <tr>
          <td class="empty" colspan={span}>
            {#if empty}{@render empty()}{:else}Nothing to show.{/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  /* Scrolls sideways on a narrow screen; with `maxHeight` it scrolls down too, under a sticky
     header. `inherit` rounds it to the card it sits in. */
  .frame {
    overflow: auto;
    border-radius: inherit;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: var(--space-2) var(--row-px);
    font-size: 12px;
    font-weight: 500;
    text-align: left;
    white-space: nowrap;
    color: var(--color-muted);
    background: var(--color-card);
    border-bottom: var(--hairline) solid var(--color-border);
  }

  td {
    padding: var(--space-2) var(--row-px);
    vertical-align: top;
    white-space: nowrap;
    border-bottom: var(--hairline) solid var(--color-border-soft);
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  [data-align='right'] {
    text-align: right;
  }

  /* The floor keeps a wrapping column from collapsing to one letter per line on a phone. */
  td.wrap {
    min-width: 12rem;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .check {
    width: 1%;
    padding-right: 0;
  }

  tr[data-row]:hover {
    background: var(--color-card-2);
  }

  tr[data-row].selected {
    background: var(--color-accent-soft);
  }

  tr.dim {
    opacity: 0.55;
  }

  tr[data-row]:focus-visible {
    outline-offset: -2px;
    border-radius: 0;
  }

  .expanded > td {
    padding: 0;
    white-space: normal;
    background: var(--color-card-2);
  }

  .empty {
    padding: var(--space-5) var(--row-px);
    white-space: normal;
    color: var(--color-muted);
  }

  th button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
  }

  th button:hover,
  th[aria-sort='ascending'],
  th[aria-sort='descending'] {
    color: var(--color-fg);
  }

  th[aria-sort='ascending'] :global(svg) {
    transform: rotate(180deg);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  @media (max-width: 1100px) {
    [data-hide='1100'] {
      display: none;
    }
  }

  @media (max-width: 768px) {
    [data-hide='768'] {
      display: none;
    }
  }
</style>
