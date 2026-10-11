import { relative } from 'node:path'
import { json } from '@sveltejs/kit'
import { DEV_FOLDER, resolveInsideCatalog } from '$lib/config'
import { updateCachedTags } from '$lib/scanner'
import { normalizeTags, readTags, writeTags } from '$lib/tags'
import type { RequestHandler } from './$types'

/** The tag vocabulary with how many projects carry each, most used first, plus the raw map. */
export const GET: RequestHandler = async () => {
  const map = await readTags(DEV_FOLDER)
  const counts = new Map<string, number>()
  for (const tags of Object.values(map))
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  const tags = [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
  return json({ tags, map })
}

/** Replace one project's tags (`{ path, tags }`); an empty list clears them. */
export const PUT: RequestHandler = async ({ request }) => {
  const { path: raw, tags } = await request.json()
  const path = resolveInsideCatalog(raw)
  if (!path) return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')) {
    return json({ error: 'tags (string array) required' }, { status: 400 })
  }
  const map = await readTags(DEV_FOLDER)
  const key = relative(DEV_FOLDER, path)
  const clean = normalizeTags(tags)
  if (clean.length) map[key] = clean
  else delete map[key]
  await writeTags(DEV_FOLDER, map)
  await updateCachedTags(DEV_FOLDER)
  return json({ path, tags: clean })
}
