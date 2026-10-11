import { readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

/**
 * `<scan root>/.atlas-tags.json` — every project's tags in one file, keyed by `relativePath`.
 *
 * Central rather than a `tags` key in each `.atlas`: tagging the whole catalog would otherwise
 * leave ~490 repos with a dirty tree. The cost is that a key follows a folder only through
 * `/api/rename` and `/api/move` (`moveTags`); a move by hand orphans it.
 */
export type TagMap = Record<string, string[]>

export const tagsPath = (baseDir: string): string => join(baseDir, '.atlas-tags.json')

/** Lowercase kebab, deduped, sorted — so `Client PSP` and `client-psp` are one tag. */
export function normalizeTags(tags: string[]): string[] {
  const clean = tags
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
  return [...new Set(clean)].sort()
}

export async function readTags(baseDir: string): Promise<TagMap> {
  try {
    return JSON.parse(await readFile(tagsPath(baseDir), 'utf-8'))
  } catch {
    return {}
  }
}

/** Re-key `from` and everything under it to `to`, for a rename or move. True when a key moved. */
export function moveTags(map: TagMap, from: string, to: string): boolean {
  let moved = false
  for (const key of Object.keys(map)) {
    if (key !== from && !key.startsWith(`${from}/`)) continue
    map[to + key.slice(from.length)] = map[key]
    delete map[key]
    moved = true
  }
  return moved
}

export async function writeTags(baseDir: string, map: TagMap): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(tagsPath(baseDir), `${JSON.stringify(sorted, null, 2)}\n`)
}

/** `/api/rename` and `/api/move`: the tags of a folder (and anything under it) follow it. */
export async function moveFolderTags(baseDir: string, from: string, to: string): Promise<void> {
  const map = await readTags(baseDir)
  if (moveTags(map, relative(baseDir, from), relative(baseDir, to))) await writeTags(baseDir, map)
}
