import { registry } from '$shared/templates'
import type { DiscoveredTemplate, TemplateError } from './templates'

export interface LintEntry {
  level: 'error' | 'warn' | 'info'
  code: string
  template?: string
  message: string
}

const UNIVERSAL_VARS = ['project_name', 'project_slug', 'description', 'author', 'mcp_servers', 'mcp_scope', '_version']

function id(t: DiscoveredTemplate): string {
  return `${t.family}/${t.name}`
}

/** Pure lint pass over discovered templates + the shared suggestion registry. */
export function lintTemplates(templates: DiscoveredTemplate[], errors: TemplateError[]): LintEntry[] {
  const entries: LintEntry[] = []

  for (const err of errors) {
    entries.push({
      level: 'error',
      code: 'parse-error',
      template: `${err.family}/${err.name}`,
      message: `${err.path}: ${err.message}`,
    })
  }

  for (const t of templates) {
    const names = new Set(t.variables.map((v) => v.name))
    const missing = UNIVERSAL_VARS.filter((v) => !names.has(v))
    if (missing.length > 0) {
      entries.push({
        level: 'warn',
        code: 'missing-universal',
        template: id(t),
        message: `missing universal vars: ${missing.join(', ')}`,
      })
    }

    for (const v of t.variables) {
      if (v.isChoice && v.choices) {
        const set = new Set(v.choices)
        if (set.size === 2 && set.has('y') && set.has('n')) {
          entries.push({
            level: 'warn',
            code: 'bool-as-choice',
            template: id(t),
            message: `${v.name}: y/n choice order [${v.choices.join(', ')}]`,
          })
        }
      }
      if (v.isDerived) {
        entries.push({
          level: 'info',
          code: 'derived-leak',
          template: id(t),
          message: `${v.name} default leaks its Jinja expression`,
        })
      }
      if (v.name === 'port') {
        entries.push({
          level: 'info',
          code: 'port-default-unused',
          template: id(t),
          message: 'port default is overridden by /api/ports/allocate at generation time',
        })
      }
    }
  }

  const onDisk = new Set(templates.map(id))
  const suggested = new Set(Object.values(registry.categories).flat())
  for (const path of onDisk) {
    if (!suggested.has(path)) {
      entries.push({
        level: 'warn',
        code: 'suggestion-drift',
        template: path,
        message: 'template exists on disk but is in no shared/templates.json category',
      })
    }
  }
  for (const path of suggested) {
    if (!onDisk.has(path)) {
      entries.push({
        level: 'warn',
        code: 'suggestion-drift',
        template: path,
        message: 'suggested in shared/templates.json but not found on disk',
      })
    }
  }

  return entries
}
