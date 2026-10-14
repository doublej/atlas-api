import { join, relative } from 'node:path'
import { moveKeys, readKeyed, writeKeyed } from './tags'

/**
 * `<scan root>/.atlas-descriptions.json` — written descriptions keyed by `relativePath`, central
 * for the same reason as the tags file: correcting the catalog's descriptions dirties no repo.
 * An entry wins over `.atlas`, the manifest and the README line; without one, those still apply.
 */
export type DescriptionMap = Record<string, string>

const descriptionsPath = (baseDir: string): string => join(baseDir, '.atlas-descriptions.json')

export const readDescriptions = (baseDir: string): Promise<DescriptionMap> =>
  readKeyed(descriptionsPath(baseDir))

export const writeDescriptions = (baseDir: string, map: DescriptionMap): Promise<void> =>
  writeKeyed(descriptionsPath(baseDir), map)

/** `/api/rename` and `/api/move`: a folder's description (and those under it) follow it. */
export async function moveFolderDescriptions(
  baseDir: string,
  from: string,
  to: string,
): Promise<void> {
  const map = await readDescriptions(baseDir)
  if (moveKeys(map, relative(baseDir, from), relative(baseDir, to)))
    await writeDescriptions(baseDir, map)
}
