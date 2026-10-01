// The template rail: one line per discovered template or broken template folder, with the
// status dot its lint findings earn. Pure, so the page and its test share it.

import type { LintEntry } from '$lib/template-lint'
import type { DiscoveredTemplate, TemplateError, VariableReference } from '$lib/templates'

export interface RailItem {
  id: string
  family: string
  name: string
  template: DiscoveredTemplate | null
  error: TemplateError | null
  status: 'error' | 'warn' | 'clean'
}

/** Templates and broken folders together, sorted by family then name. */
export function buildRail(
  templates: DiscoveredTemplate[],
  errors: TemplateError[],
  lint: LintEntry[],
): RailItem[] {
  const items: RailItem[] = templates.map((t) => {
    const id = `${t.family}/${t.name}`
    const warn = lint.some((l) => l.template === id && l.level !== 'info')
    return {
      id,
      family: t.family,
      name: t.name,
      template: t,
      error: null,
      status: warn ? 'warn' : 'clean',
    }
  })
  for (const e of errors) {
    items.push({
      id: `${e.family}/${e.name}`,
      family: e.family,
      name: e.name,
      template: null,
      error: e,
      status: 'error',
    })
  }
  return items.sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name))
}

/** Which files a variable shows up in, and how (hook / conditional / interpolation). */
export function referencesByFile(
  refs: VariableReference[],
): Map<string, VariableReference['kind'][]> {
  const map = new Map<string, VariableReference['kind'][]>()
  for (const r of refs) {
    const kinds = map.get(r.file) ?? []
    if (!kinds.includes(r.kind)) kinds.push(r.kind)
    map.set(r.file, kinds)
  }
  return map
}
