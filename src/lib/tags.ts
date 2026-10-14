import { readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

export { normalizeTags } from './tag-normalize'

/**
 * `<scan root>/.atlas-tags.json` — every project's tags in one file, keyed by `relativePath`.
 *
 * Central rather than a `tags` key in each `.atlas`: tagging the whole catalog would otherwise
 * leave ~490 repos with a dirty tree. The cost is that a key follows a folder only through
 * `/api/rename` and `/api/move` (`moveKeys`); a move by hand orphans it.
 * `.atlas-descriptions.json` (`./descriptions`) is the same kind of file and shares the helpers.
 */
export type TagMap = Record<string, string[]>

export const tagsPath = (baseDir: string): string => join(baseDir, '.atlas-tags.json')

/** A `relativePath`-keyed file at the scan root; missing or unreadable reads as empty. */
export async function readKeyed<T>(file: string): Promise<Record<string, T>> {
  try {
    return JSON.parse(await readFile(file, 'utf-8'))
  } catch {
    return {}
  }
}

export async function writeKeyed(file: string, map: Record<string, unknown>): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))
  await writeFile(file, `${JSON.stringify(sorted, null, 2)}\n`)
}

/** Re-key `from` and everything under it to `to`, for a rename or move. True when a key moved. */
export function moveKeys(map: Record<string, unknown>, from: string, to: string): boolean {
  let moved = false
  for (const key of Object.keys(map)) {
    if (key !== from && !key.startsWith(`${from}/`)) continue
    map[to + key.slice(from.length)] = map[key]
    delete map[key]
    moved = true
  }
  return moved
}

export const readTags = (baseDir: string): Promise<TagMap> => readKeyed(tagsPath(baseDir))

export const writeTags = (baseDir: string, map: TagMap): Promise<void> =>
  writeKeyed(tagsPath(baseDir), map)

/** `/api/rename` and `/api/move`: the tags of a folder (and anything under it) follow it. */
export async function moveFolderTags(baseDir: string, from: string, to: string): Promise<void> {
  const map = await readTags(baseDir)
  if (moveKeys(map, relative(baseDir, from), relative(baseDir, to))) await writeTags(baseDir, map)
}
