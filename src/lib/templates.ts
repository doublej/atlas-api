import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { errorMessage } from './format'

export interface VariableReference {
  file: string
  kind: 'hook' | 'conditional' | 'interpolation'
}

export interface TemplateVariable {
  name: string
  default: string | boolean
  isChoice: boolean
  choices?: string[]
  isDerived: boolean
  references: VariableReference[]
}

export interface DiscoveredTemplate {
  family: string
  name: string
  description: string
  version: string | null
  path: string
  variables: TemplateVariable[]
}

export interface TemplateError {
  path: string
  family: string
  name: string
  message: string
}

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.zip',
  '.pdf',
  '.pyc',
])

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

function isJinjaExpr(value: unknown): boolean {
  return typeof value === 'string' && (value.includes('{{') || value.includes('{%'))
}

function extractVariables(c: Record<string, unknown>): Omit<TemplateVariable, 'references'>[] {
  return Object.entries(c)
    .filter(([k]) => !k.startsWith('_'))
    .map(([name, value]) => {
      const isChoice = Array.isArray(value)
      const choices = isChoice ? (value as string[]) : undefined
      const def = (isChoice ? choices![0] : value) as string | boolean
      return {
        name,
        default: def,
        isChoice,
        choices,
        isDerived: isJinjaExpr(isChoice ? choices?.[0] : def),
      }
    })
}

/** Walk every non-binary file under the template dir (excluding cookiecutter.json), returning [relPath, lines]. */
async function readTemplateFiles(root: string, dir = root): Promise<Array<[string, string[]]>> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files: Array<[string, string[]]> = []
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__pycache__') continue
      files.push(...(await readTemplateFiles(root, full)))
      continue
    }
    if (!e.isFile() || full === join(root, 'cookiecutter.json')) continue
    const ext = e.name.slice(e.name.lastIndexOf('.')).toLowerCase()
    if (BINARY_EXTENSIONS.has(ext)) continue
    let content: string
    try {
      content = await readFile(full, 'utf-8')
    } catch {
      continue
    }
    files.push([relative(root, full), content.split('\n')])
  }
  return files
}

/** Line-based scan (no Jinja parser) for where each variable is referenced across the template dir. */
async function scanReferences(
  templateDir: string,
  variableNames: string[],
): Promise<Map<string, VariableReference[]>> {
  const refs = new Map<string, VariableReference[]>(variableNames.map((n) => [n, []]))
  const files = await readTemplateFiles(templateDir)
  for (const [relPath, lines] of files) {
    const isHook = relPath.split(sep)[0] === 'hooks'
    for (const line of lines) {
      for (const name of variableNames) {
        if (!line.includes(name)) continue
        const kind: VariableReference['kind'] = isHook
          ? 'hook'
          : line.includes('{% if') || line.includes('{%if')
            ? 'conditional'
            : 'interpolation'
        refs.get(name)!.push({ file: relPath, kind })
      }
    }
  }
  return refs
}

/** A template's family (its top-level folder, else `root`) and name (its own folder). */
function templateId(ccPath: string, root: string): { family: string; name: string } {
  const parts = relative(root, dirname(ccPath)).split(sep)
  return { family: parts.length > 1 ? parts[0] : 'root', name: parts[parts.length - 1] }
}

async function parseTemplate(
  ccPath: string,
  root: string,
): Promise<{ template: DiscoveredTemplate } | { error: TemplateError }> {
  const dir = dirname(ccPath)
  const { family, name } = templateId(ccPath, root)
  let content: Record<string, unknown>
  try {
    content = JSON.parse(await readFile(ccPath, 'utf-8')) as Record<string, unknown>
  } catch (err) {
    return {
      error: {
        path: ccPath,
        family,
        name,
        message: errorMessage(err),
      },
    }
  }
  const variables = extractVariables(content)
  const refs = await scanReferences(
    dir,
    variables.map((v) => v.name),
  )
  return {
    template: {
      family,
      name,
      description: describe(content),
      version: (content._version as string) ?? null,
      path: dir,
      variables: variables.map((v) => ({ ...v, references: refs.get(v.name) ?? [] })),
    },
  }
}

/** Discover cookiecutter templates under `root` (the authoritative `ATLAS_TEMPLATES_DIR`). */
export async function discoverTemplates(
  root: string,
): Promise<{ templates: DiscoveredTemplate[]; errors: TemplateError[] }> {
  const paths = await findCookiecutters(root)
  const parsed = await Promise.all(paths.map((p) => parseTemplate(p, root)))
  const templates = parsed
    .filter((r): r is { template: DiscoveredTemplate } => 'template' in r)
    .map((r) => r.template)
    .sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name))
  const errors = parsed
    .filter((r): r is { error: TemplateError } => 'error' in r)
    .map((r) => r.error)
  return { templates, errors }
}

/**
 * `family/name` → `_version` per template: all the project list needs. Reads the ~20
 * `cookiecutter.json` files only (~5ms), where `discoverTemplates` reads every template file
 * for variable references (65-400ms). A template whose JSON does not parse is left out.
 */
export async function readTemplateVersions(root: string): Promise<Record<string, string>> {
  const entries = await Promise.all(
    (await findCookiecutters(root)).map(async (cc) => {
      const { family, name } = templateId(cc, root)
      try {
        const version = JSON.parse(await readFile(cc, 'utf-8'))._version
        return typeof version === 'string' ? [[`${family}/${name}`, version] as const] : []
      } catch {
        return []
      }
    }),
  )
  return Object.fromEntries(entries.flat())
}
