// Pure filter logic for the project browser. Kept free of runes so it can be
// unit-tested directly; the page owns the reactive $state and hands a snapshot
// of it to these functions.

import type { Framework, Project } from '$lib/scanner'

export type PromotionFilter = 'promoted' | 'unpromoted' | 'in-progress'

export interface FilterCriteria {
  search: string
  frameworks: Set<Framework>
  types: Set<string>
  runners: Set<string>
  /** hosts.json ids — the machine facet. Empty means every machine. */
  hosts: Set<string>
  tools: Set<string>
  onlyWithDev: boolean
  onlyWithReadme: boolean
  promotion: PromotionFilter | null
}

export function emptyCriteria(): FilterCriteria {
  return {
    search: '',
    frameworks: new Set(),
    types: new Set(),
    runners: new Set(),
    hosts: new Set(),
    tools: new Set(),
    onlyWithDev: false,
    onlyWithReadme: false,
    promotion: null,
  }
}

function matchesSearch(project: Project, search: string): boolean {
  if (!search) return true
  const needle = search.toLowerCase()
  return (
    project.name.toLowerCase().includes(needle) ||
    project.relativePath.toLowerCase().includes(needle) ||
    (project.description?.toLowerCase().includes(needle) ?? false)
  )
}

function matchesPromotion(project: Project, promotion: PromotionFilter | null): boolean {
  if (promotion === 'promoted') return Boolean(project.promotion)
  if (promotion === 'unpromoted') return !project.promotion
  if (promotion === 'in-progress') return project.promotion?.status === 'in-progress'
  return true
}

/** An empty facet selects everything; otherwise the project's value must be one of the picks. */
function facetOk<T extends string>(selected: Set<T>, value: T | undefined): boolean {
  return selected.size === 0 || (value !== undefined && selected.has(value))
}

function matchesFacets(project: Project, c: FilterCriteria): boolean {
  return (
    facetOk(c.frameworks, project.framework) &&
    facetOk(c.types, project.type) &&
    facetOk(c.runners, project.runner) &&
    facetOk(c.hosts, project.host)
  )
}

/** True when `project` survives every active filter. */
export function matchesFilters(project: Project, c: FilterCriteria): boolean {
  if (!matchesSearch(project, c.search)) return false
  if (!matchesFacets(project, c)) return false
  if (c.tools.has('just') && !project.hasJustfile) return false
  if (c.onlyWithDev && !project.devCommand) return false
  if (c.onlyWithReadme && !project.readme) return false
  return matchesPromotion(project, c.promotion)
}

/** How many filters are engaged — drives the toolbar badge. Search is not counted. */
export function countActiveFilters(c: FilterCriteria): number {
  return (
    c.frameworks.size +
    c.types.size +
    c.runners.size +
    c.hosts.size +
    c.tools.size +
    (c.onlyWithDev ? 1 : 0) +
    (c.onlyWithReadme ? 1 : 0) +
    (c.promotion ? 1 : 0)
  )
}

/** Toggle membership without mutating the original — assignment drives reactivity. */
export function toggleSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}
