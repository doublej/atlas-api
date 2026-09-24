/** A row's sort value; `null`/`undefined`/'' are blank and always sort last. */
export type SortValue = string | number | null | undefined

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

const isBlank = (v: SortValue) => v === null || v === undefined || v === ''

/** Sorted copy of `rows` by `value`; blanks last in both directions. */
export function sortRows<T>(rows: T[], value: (row: T) => SortValue, descending: boolean): T[] {
  const sign = descending ? -1 : 1
  return [...rows].sort((a, b) => {
    const [va, vb] = [value(a), value(b)]
    if (isBlank(va) || isBlank(vb)) return Number(isBlank(va)) - Number(isBlank(vb))
    return sign * compare(va as string | number, vb as string | number)
  })
}

/**
 * One table's sort: click a header to sort by it, click again to flip. `null` keeps the rows in
 * the order they came in. Columns in `descendingFirst` (sizes, counts, dates) open high-to-low.
 */
export class TableSort<K extends string> {
  key = $state<K | null>(null)
  descending = $state(false)
  readonly #descendingFirst: ReadonlySet<K>

  constructor(key: K | null = null, descendingFirst: K[] = []) {
    this.#descendingFirst = new Set(descendingFirst)
    this.key = key
    this.descending = key !== null && this.#descendingFirst.has(key)
  }

  by(key: K): void {
    this.descending = this.key === key ? !this.descending : this.#descendingFirst.has(key)
    this.key = key
  }

  apply<T>(rows: T[], values: Record<K, (row: T) => SortValue>): T[] {
    return this.key === null ? rows : sortRows(rows, values[this.key], this.descending)
  }
}
