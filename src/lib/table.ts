/** The pure half of `components/table/Table.svelte`: its column type and its keyboard map. */
import type { Snippet } from 'svelte'
import type { SortValue } from './table-sort.svelte'

/** What a cell snippet gets besides its row. */
export interface RowState {
  selected: boolean
  open: boolean
  /** Opens or closes this row's `expanded` snippet. */
  toggleOpen: () => void
}

export interface Column<T> {
  /** Unique within the table; also the sort key. */
  key: string
  label: string
  cell: Snippet<[T, RowState]>
  /** The value this column sorts by. Without it the header is plain text. */
  sort?: (row: T) => SortValue
  /** Numbers, sizes, durations. */
  align?: 'right'
  /** Lets the cell wrap (anywhere) instead of staying on one line. */
  wrap?: boolean
  /** Claims 40% of the width and ellipsizes past it — the one column that may shrink. */
  fill?: boolean
  /** Hides the column below this viewport width. */
  hideBelow?: 768 | 1100
  /** Keeps the label for screen readers only — icon columns. */
  hideLabel?: boolean
}

export type RowKeyAction =
  | { kind: 'move'; index: number }
  | { kind: 'toggle' }
  | { kind: 'expand' }
  | null

/** Roving row focus: j/k or the arrows move, x or Space toggles selection, Enter expands. */
export function rowKeyAction(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean },
  index: number,
  count: number,
): RowKeyAction {
  if (e.metaKey || e.ctrlKey || e.altKey) return null
  switch (e.key) {
    case 'ArrowDown':
    case 'j':
      return { kind: 'move', index: Math.min(index + 1, count - 1) }
    case 'ArrowUp':
    case 'k':
      return { kind: 'move', index: Math.max(index - 1, 0) }
    case ' ':
    case 'x':
      return { kind: 'toggle' }
    case 'Enter':
      return { kind: 'expand' }
    default:
      return null
  }
}
