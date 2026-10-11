import { goto } from '$app/navigation'
import { sortFromParam, sortToParam } from '$lib/components/table/ProjectTable.svelte'
import { Selection } from '$lib/selection.svelte'
import type { TableSort } from '$lib/table-sort.svelte'
import {
  countActiveFilters,
  criteriaFromQuery,
  criteriaToQuery,
  emptyCriteria,
  type FilterCriteria,
  toggleSet,
} from '../filters'

export type ViewMode = 'table' | 'flat' | 'nested'
const VIEWS: string[] = ['table', 'flat', 'nested']

/**
 * The "/" list's view: filters, view mode, sort and the bulk selection. Everything but the
 * selection lives in the URL (`?q=…&tag=a&tag=b&view=nested&sort=-modified`), so a filtered view
 * survives a reload and can be bookmarked. Construct it during component init: it owns an effect.
 */
export class ListView {
  criteria = $state<FilterCriteria>(emptyCriteria())
  viewMode = $state<ViewMode>('table')
  showFilters = $state(false)
  readonly sort: TableSort<string>
  readonly selection = new Selection<string>()

  constructor(params: URLSearchParams) {
    this.criteria = criteriaFromQuery(params)
    const view = params.get('view') ?? ''
    if (VIEWS.includes(view)) this.viewMode = view as ViewMode
    this.sort = sortFromParam(params.get('sort'))
    this.showFilters = countActiveFilters(this.criteria) > 0
    // A replacing goto, so typing a search piles up no history entries. Not `replaceState`: that
    // is shallow routing, and Back to this page would return the URL it was loaded with. The load
    // reads no `url`, so this navigation fetches nothing.
    $effect(() => {
      const url = new URL(location.href)
      url.search = this.query().toString()
      if (url.href !== location.href)
        goto(url, { replaceState: true, keepFocus: true, noScroll: true })
    })
  }

  query(): URLSearchParams {
    const q = criteriaToQuery(this.criteria)
    if (this.viewMode !== 'table') q.set('view', this.viewMode)
    const sort = sortToParam(this.sort)
    if (sort) q.set('sort', sort)
    return q
  }

  /** Every filter off; the search stays. */
  clearFilters(): void {
    this.criteria = { ...emptyCriteria(), search: this.criteria.search }
  }

  toggleTag(tag: string): void {
    this.criteria.tags = toggleSet(this.criteria.tags, tag)
  }
}
