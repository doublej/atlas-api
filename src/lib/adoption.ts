import type { Project } from './scanner'

export interface TemplateVersionInfo {
  name: string
  path: string
  version: string
  behind: boolean
}

export interface TemplateAdoption {
  currentVersion: string
  projects: TemplateVersionInfo[]
  behindCount: number
  totalCount: number
}

export interface TemplateCatalogEntry {
  name: string
  currentVersion: string
}

export function adoptionByTemplate(
  projects: Project[],
  templates: TemplateCatalogEntry[],
): Record<string, TemplateAdoption> {
  const currentVersions = new Map(templates.map((t) => [t.name, t.currentVersion]))
  const result: Record<string, TemplateAdoption> = {}

  for (const project of projects) {
    if (!project.template) continue
    const { name, version } = project.template
    const currentVersion = currentVersions.get(name) ?? version

    if (!result[name]) {
      result[name] = { currentVersion, projects: [], behindCount: 0, totalCount: 0 }
    }

    const behind = version !== currentVersion
    result[name].projects.push({ name: project.name, path: project.path, version, behind })
    result[name].totalCount++
    if (behind) result[name].behindCount++
  }

  return result
}
