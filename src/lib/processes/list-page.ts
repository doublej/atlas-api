/** What /processes and /ports share in the browser: the page keys and the query in the URL. */
import { replaceState } from '$app/navigation'

interface Keys {
  search: () => HTMLElement | null | undefined
  /** `key` is the focused row's `data-key`, when a row has the focus. */
  stop: (key: string | null) => void
  clear: () => void
  /** A dialog is open: the page keys stand down. */
  busy: () => boolean
}

const TYPING = 'input, textarea, select, dialog, [contenteditable]'
const focusFirstRow = () =>
  document.querySelector<HTMLElement>('main tr[data-row][tabindex="0"]')?.focus()

/**
 * `/` search, `j`/`k` into the rows, `s` stop, Escape clears the selection. Once a row has the
 * focus the Table itself moves (`j`/`k`), selects (`x`) and expands (Enter).
 */
export function listKeys(keys: Keys) {
  const actions: Record<string, (row: Element | null) => void> = {
    '/': () => keys.search()?.focus(),
    j: focusFirstRow,
    k: focusFirstRow,
    s: (row) => keys.stop(row?.querySelector<HTMLElement>('[data-key]')?.dataset.key ?? null),
    Escape: () => keys.clear(),
  }
  return (e: KeyboardEvent) => {
    const target = e.target instanceof Element ? e.target : null
    const row = target?.closest('tr[data-row]') ?? null
    const action = actions[e.key]
    if (!action || keys.busy() || pass(e, target, row)) return
    action(row)
    e.preventDefault()
  }
}

/** Keys the page leaves alone: modified, typed into a field, or moving inside the Table. */
const pass = (e: KeyboardEvent, target: Element | null, row: Element | null) =>
  e.metaKey ||
  e.ctrlKey ||
  e.altKey ||
  Boolean(target?.closest(TYPING)) ||
  (row !== null && (e.key === 'j' || e.key === 'k'))

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
