import { relative } from 'node:path'
import { json } from '@sveltejs/kit'
import { DEV_FOLDER, resolveInsideCatalog } from '$lib/config'
import { readDescriptions, writeDescriptions } from '$lib/descriptions'
import { updateCachedTags } from '$lib/scanner'
import type { RequestHandler } from './$types'

/** `{ path, description }` → `.atlas-descriptions.json`, never the repo; an empty one clears the entry. */
export const PUT: RequestHandler = async ({ request }) => {
  const { path: raw, description } = await request.json()

  if (!raw || typeof description !== 'string') {
    return json({ error: 'Missing path or description' }, { status: 400 })
  }

  const path = resolveInsideCatalog(raw)
  if (!path) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  const map = await readDescriptions(DEV_FOLDER)
  const key = relative(DEV_FOLDER, path)
  const text = description.trim()
  if (text) map[key] = text
  else delete map[key]
  await writeDescriptions(DEV_FOLDER, map)
  await updateCachedTags(DEV_FOLDER)
  return json({ updated: true })
}
