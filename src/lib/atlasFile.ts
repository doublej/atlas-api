import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The two files that let you correct the scanner by hand: a project's own `.atlas`, and the
 * root-level `.atlas-config.json` that says how deep to walk and which folders are projects.
 *
 * Both are plain JSON edited by humans (or by `/api/atlas` and `/api/config`). Neither is
 * required — every read falls back to a default, so a missing or corrupt file costs a
 * correction, never a scan.
 */

/** A project's `.atlas`. Open-ended on purpose: the scanner reads the keys it knows. */
export type AtlasMeta = Record<string, unknown>

const atlasPath = (dir: string): string => join(dir, '.atlas')

export async function readAtlas(dir: string): Promise<AtlasMeta> {
  try {
    return JSON.parse(await readFile(atlasPath(dir), 'utf-8'))
  } catch {
    return {}
  }
}

/**
 * Merge `patch` into a project's `.atlas`, creating the file when absent. A `null` value
 * deletes its key — that is how the UI clears an override rather than pinning an empty one.
 */
export async function patchAtlas(dir: string, patch: AtlasMeta): Promise<AtlasMeta> {
  const meta = await readAtlas(dir)
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete meta[key]
    else meta[key] = value
  }
  await writeFile(atlasPath(dir), `${JSON.stringify(meta, null, 2)}\n`)
  return meta
}

/**
 * `<scan root>/.atlas-config.json` — the scanner's own knobs.
 *
 * `depth` and `force` are keyed by a project-relative path (`python/suna`, the same string
 * a Project carries as `relativePath`), so they survive a rename of anything above them only
 * as well as the path does. That is the trade for a config you can read at a glance.
 */
export interface AtlasConfig {
  /** How many levels below the root to walk. The scanner's historical value is 3. */
  maxDepth: number
  /** Per-subtree depth limit, absolute from the root. Also the only way to walk *into* a project. */
  depth: Record<string, number>
  /** `true` — always a project. `false` — never one, keep walking through it. */
  force: Record<string, boolean>
  /** Glob patterns whose matching folders are skipped whole — not catalogued, not walked. */
  ignore: string[]
}

export const DEFAULT_CONFIG: AtlasConfig = { maxDepth: 3, depth: {}, force: {}, ignore: [] }

export const configPath = (baseDir: string): string => join(baseDir, '.atlas-config.json')

export async function readConfig(baseDir: string): Promise<AtlasConfig> {
  try {
    const raw = JSON.parse(await readFile(configPath(baseDir), 'utf-8'))
    return {
      maxDepth: typeof raw.maxDepth === 'number' ? raw.maxDepth : DEFAULT_CONFIG.maxDepth,
      depth: raw.depth ?? {},
      force: raw.force ?? {},
      ignore: Array.isArray(raw.ignore)
        ? raw.ignore.filter((p: unknown) => typeof p === 'string')
        : [],
    }
  } catch {
    return { ...DEFAULT_CONFIG, depth: {}, force: {}, ignore: [] }
  }
}

export async function writeConfig(baseDir: string, config: AtlasConfig): Promise<AtlasConfig> {
  await writeFile(configPath(baseDir), `${JSON.stringify(config, null, 2)}\n`)
  return config
}

/**
 * The depth limit in force at `rel`: the nearest ancestor (or the folder itself) carrying an
 * override, else the global `maxDepth`. Walked as a string prefix rather than a tree because
 * the map holds a handful of entries and a scan asks this once per folder.
 */
export function depthLimit(config: AtlasConfig, rel: string): number {
  let limit = config.maxDepth
  let best = -1
  for (const [key, value] of Object.entries(config.depth)) {
    if (rel === key || rel.startsWith(`${key}/`)) {
      if (key.length > best) {
        best = key.length
        limit = value
      }
    }
  }
  return limit
}

const compiled = new Map<string, RegExp>()

/**
 * Glob → RegExp. `*` stays inside one path segment, `**` crosses them, and a leading `/`
 * anchors the pattern to the scan root. Everything else may match at any depth, so a bare
 * `app-worktrees` — and a starred form of the same path — catch those folders under every
 * project rather than only the ones sitting exactly that far down. The strict gitignore
 * reading of a starred path matches nothing here, and a rule that silently matches nothing is
 * worse than a forgiving one. A match on a folder takes its whole subtree with it.
 */
function globToRegExp(pattern: string): RegExp {
  const cached = compiled.get(pattern)
  if (cached) return cached

  const anchored = pattern.startsWith('/')
  const body = (anchored ? pattern.slice(1) : pattern)
    .replace(/\/$/, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\u0000')
    .replaceAll('*', '[^/]*')
    .replaceAll('\u0000', '.*')
  const regex = new RegExp(`^${anchored ? '' : '(?:.*/)?'}${body}(?:/.*)?$`)
  compiled.set(pattern, regex)
  return regex
}

/** Whether this project-relative path is covered by an `ignore` pattern. */
export const isIgnored = (config: AtlasConfig, rel: string): boolean =>
  config.ignore.some((pattern) => globToRegExp(pattern).test(rel))
