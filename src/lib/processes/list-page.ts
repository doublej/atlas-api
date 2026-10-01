/** What /processes and /ports share in the browser: the page keys and the query in the URL. */
import { replaceState } from '$app/navigation'

interface Keys {
  search: () => HTMLElement | null | undefined
  /** `key` is the focused row's `data-key`, when a row has the focus. */
  stop: (key: string | null) => void
  clear: () => void
  /** cmd/ctrl+A: every visible row. */
  selectAll: () => void
  /** A dialog is open: the page keys stand down. */
  busy: () => boolean
}

const TYPING = 'input, textarea, select, dialog, [contenteditable]'
const focusFirstRow = () =>
  document.querySelector<HTMLElement>('main tr[data-row][tabindex="0"]')?.focus()

/** `mod+a` for cmd/ctrl+A; any other modified key names nothing and stays the browser's. */
const keyName = (e: KeyboardEvent) =>
  e.metaKey || e.ctrlKey ? `mod+${e.key.toLowerCase()}` : e.altKey ? '' : e.key

/**
 * `j`/`k` before any row has the focus go to the rows; inside a row the Table moves, and past
 * the edge of one group's table the move steps into the next (or previous) group's.
 */
function move(row: Element | null, e: KeyboardEvent, by: 1 | -1): void {
  if (!row) focusFirstRow()
  if (!row || e.target !== row) return
  const rows = [...document.querySelectorAll<HTMLElement>('main tr[data-row]')]
  const next = rows[rows.indexOf(row as HTMLElement) + by]
  // Inside one table the Table has moved the focus already.
  if (next && next.parentElement !== row.parentElement) next.focus()
}

/**
 * `/` search, `j`/`k` through the rows, `s` stop, Escape clears the selection, cmd/ctrl+A selects
 * every row. Once a row has the focus the Table itself selects (`x`) and expands (Enter).
 */
export function listKeys(keys: Keys) {
  const actions: Record<string, (row: Element | null, e: KeyboardEvent) => void> = {
    '/': () => keys.search()?.focus(),
    j: (row, e) => move(row, e, 1),
    k: (row, e) => move(row, e, -1),
    s: (row) => keys.stop(row?.querySelector<HTMLElement>('[data-key]')?.dataset.key ?? null),
    Escape: () => keys.clear(),
    'mod+a': () => keys.selectAll(),
  }
  return (e: KeyboardEvent) => {
    const target = e.target instanceof Element ? e.target : null
    const action = actions[keyName(e)]
    if (!action || keys.busy() || target?.closest(TYPING)) return
    action(target?.closest('tr[data-row]') ?? null, e)
    e.preventDefault()
  }
}

/** Filters, sort and search live in the URL, so a reload or a shared link keeps them. */
export function writeQuery(values: Record<string, string | null | undefined>): void {
  const url = new URL(location.href)
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  if (url.href !== location.href) replaceState(url, {})
}

/** A comma list from the URL. */
export const listParam = (params: URLSearchParams, key: string): string[] =>
  (params.get(key) ?? '').split(',').filter(Boolean)
