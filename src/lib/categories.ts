import type { Project, ProjectAtlas } from './scanner'

export interface Category {
  name: string
  projectCount: number
  dominantType: string | null
}

/** A real dev category — not an `_archive`/`_management` bucket or a dotfile. */
const isCategory = (name: string): boolean =>
  name.length > 0 && !name.startsWith('_') && !name.startsWith('.')

function categoryNames(atlas: ProjectAtlas): Set<string> {
  const set = new Set<string>()
  for (const folder of atlas.folders) {
    const top = folder.split('/')[0]
    if (isCategory(top)) set.add(top)
  }
  for (const p of atlas.projects) {
    const top = p.relativePath.split('/')[0]
    if (p.relativePath.includes('/') && isCategory(top)) set.add(top)
  }
  return set
}

function statsFor(name: string, projects: Project[]): Omit<Category, 'name'> {
  const prefix = `${name}/`
  const types: Record<string, number> = {}
  let projectCount = 0
  for (const p of projects) {
    if (!p.relativePath.startsWith(prefix)) continue
    projectCount++
    if (p.type) types[p.type] = (types[p.type] ?? 0) + 1
  }
  const dominantType = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  return { projectCount, dominantType }
}

/** Depth-1 dev categories derived from a (cached) scan — most-populated first. */
export function deriveCategories(atlas: ProjectAtlas): Category[] {
  return [...categoryNames(atlas)]
    .map((name) => ({ name, ...statsFor(name, atlas.projects) }))
    .sort((a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name))
}
