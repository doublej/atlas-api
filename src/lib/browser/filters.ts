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

function matchesFacets(project: Project, c: FilterCriteria): boolean {
  if (c.frameworks.size > 0 && (!project.framework || !c.frameworks.has(project.framework)))
    return false
  if (c.types.size > 0 && (!project.type || !c.types.has(project.type))) return false
  if (c.runners.size > 0 && (!project.runner || !c.runners.has(project.runner))) return false
  return true
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
