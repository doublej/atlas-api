import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'

export interface TemplateVariable {
  name: string
  default: string | boolean
  isChoice: boolean
  choices?: string[]
}

export interface DiscoveredTemplate {
  family: string
  name: string
  description: string
  version: string | null
  path: string
  variables: TemplateVariable[]
}

/** Find each `cookiecutter.json`, stopping at the first hit per branch (don't descend into the rendered body). */
async function findCookiecutters(dir: string, depth = 0): Promise<string[]> {
  if (depth > 3) return []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  if (entries.some((e) => e.isFile() && e.name === 'cookiecutter.json')) {
    return [join(dir, 'cookiecutter.json')]
  }
  const nested = await Promise.all(
    entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => findCookiecutters(join(dir, e.name), depth + 1)),
  )
  return nested.flat()
}

function describe(c: Record<string, unknown>): string {
  return (c.description as string) || (c.project_description as string) || 'No description'
}

function extractVariables(c: Record<string, unknown>): TemplateVariable[] {
  return Object.entries(c)
    .filter(([k]) => !k.startsWith('_'))
    .map(([name, value]) => {
      const isChoice = Array.isArray(value)
      const choices = isChoice ? (value as string[]) : undefined
      return {
        name,
        default: (isChoice ? choices![0] : value) as string | boolean,
        isChoice,
        choices,
      }
    })
}

async function parseTemplate(ccPath: string, root: string): Promise<DiscoveredTemplate | null> {
  try {
    const content = JSON.parse(await readFile(ccPath, 'utf-8')) as Record<string, unknown>
    const dir = dirname(ccPath)
    const parts = relative(root, dir).split(sep)
    return {
      family: parts.length > 1 ? parts[0] : 'root',
      name: parts[parts.length - 1],
      description: describe(content),
      version: (content._version as string) ?? null,
      path: dir,
      variables: extractVariables(content),
    }
  } catch {
    return null
  }
}

/** Discover cookiecutter templates under `root` (the authoritative `ATLAS_TEMPLATES_DIR`). */
export async function discoverTemplates(root: string): Promise<DiscoveredTemplate[]> {
  const paths = await findCookiecutters(root)
  const parsed = await Promise.all(paths.map((p) => parseTemplate(p, root)))
  return parsed
    .filter((t): t is DiscoveredTemplate => t !== null)
    .sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name))
}
