/** Modifier keys a selection click reads — a `MouseEvent` has them. */
export interface ClickMods {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}

/**
 * Row selection keyed by a stable id (a path, a version id, a pid). One rule on every page:
 * - plain click: select only this row; clicking the only selected row clears it
 * - cmd/ctrl-click, a row's checkbox, `x`/Space: toggle this row and keep the rest
 * - shift-click: add every row from the anchor to this one, in `order`, and keep the rest
 * The anchor is the last row clicked or toggled without shift; a shift-click with no anchor in
 * `order` (none yet, or it went away) acts as a plain click.
 */
export class Selection<K extends string | number = string> {
  keys = $state(new Set<K>())
  #anchor: K | null = null

  has(k: K): boolean {
    return this.keys.has(k)
  }

  get size(): number {
    return this.keys.size
  }

  /** The selected ids, in the order they were selected. */
  get list(): K[] {
    return [...this.keys]
  }

  /** Select or deselect many at once (a group's or the header's checkbox). */
  set(ks: K[], on: boolean): void {
    const next = new Set(this.keys)
    for (const k of ks) on ? next.add(k) : next.delete(k)
    this.keys = next
  }

  toggle(k: K): void {
    this.set([k], !this.keys.has(k))
    this.#anchor = k
  }

  /** `order` is every visible row id in render order — across sibling tables too. */
  click(k: K, e: ClickMods, order: K[]): void {
    const from = this.#anchor === null ? -1 : order.indexOf(this.#anchor)
    const to = order.indexOf(k)
    if (e.shiftKey && from !== -1 && to !== -1) {
      this.set(order.slice(Math.min(from, to), Math.max(from, to) + 1), true)
    } else if (e.metaKey || e.ctrlKey) {
      this.toggle(k)
    } else {
      this.keys = this.size === 1 && this.has(k) ? new Set() : new Set([k])
      this.#anchor = k
    }
  }

  clear(): void {
    this.keys = new Set()
    this.#anchor = null
  }

  /** Drop ids that are no longer rows — call it after every refresh of the data. */
  prune(live: Iterable<K>): void {
    const alive = new Set(live)
    if (this.list.some((k) => !alive.has(k)))
      this.keys = new Set(this.list.filter((k) => alive.has(k)))
  }
}
