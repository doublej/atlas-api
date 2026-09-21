import { json } from '@sveltejs/kit'
import { type AtlasConfig, readConfig, writeConfig } from '$lib/atlasFile'
import { DEV_FOLDER } from '$lib/config'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => json(await readConfig(DEV_FOLDER))

/**
 * Replace the scanner config. Whole-document writes rather than a patch: there are three keys,
 * and a settings page that reads then writes the whole thing cannot half-apply a change.
 */
export const PUT: RequestHandler = async ({ request }) => {
  const body = await request.json()
  const maxDepth = Number(body?.maxDepth)
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 12) {
    return json({ error: 'maxDepth must be an integer from 1 to 12' }, { status: 400 })
  }
  const config: AtlasConfig = {
    maxDepth,
    depth: Object.fromEntries(
      Object.entries(body.depth ?? {})
        .filter(([, v]) => Number.isInteger(Number(v)))
        .map(([k, v]) => [k, Number(v)]),
    ),
    ignore: Array.isArray(body.ignore)
      ? body.ignore.filter((p: unknown): p is string => typeof p === 'string' && p.trim() !== '')
      : [],
    force: Object.fromEntries(
      Object.entries(body.force ?? {})
        .filter(([, v]) => typeof v === 'boolean')
        .map(([k, v]) => [k, v as boolean]),
    ),
  }
  return json(await writeConfig(DEV_FOLDER, config))
}
