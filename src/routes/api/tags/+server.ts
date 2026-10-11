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

/**
 * Bulk edit: `{ paths, add?, remove? }` adds and removes tags on every project in `paths` in one
 * write. A path outside the catalog fails the whole request before anything is written.
 */
export const PATCH: RequestHandler = async ({ request }) => {
  const { paths, add = [], remove = [] } = await request.json()
  const strings = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((t) => typeof t === 'string')
  if (!strings(paths) || !paths.length || !strings(add) || !strings(remove)) {
    return json(
      { error: 'paths (non-empty string array), add?, remove? required' },
      { status: 400 },
    )
  }
  const resolved = paths.map((p) => resolveInsideCatalog(p))
  const bad = paths.find((_, i) => !resolved[i])
  if (bad) return json({ error: `${bad} is not in this machine's catalog` }, { status: 400 })

  const map = await readTags(DEV_FOLDER)
  const plus = normalizeTags(add)
  const minus = new Set(normalizeTags(remove))
  const updated = (resolved as string[]).map((path) => {
    const key = relative(DEV_FOLDER, path)
    const tags = normalizeTags([...(map[key] ?? []), ...plus]).filter((t) => !minus.has(t))
    if (tags.length) map[key] = tags
    else delete map[key]
    return { path, tags }
  })
  await writeTags(DEV_FOLDER, map)
  await updateCachedTags(DEV_FOLDER)
  return json({ updated })
}
