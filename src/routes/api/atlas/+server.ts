import { json } from '@sveltejs/kit'
import { type AtlasMeta, patchAtlas, readAtlas } from '$lib/atlasFile'
import { resolveLocal } from '$lib/config'
import type { RequestHandler } from './$types'

/** Read one project's `.atlas`. Absent file answers `{}` — not an error, just no overrides. */
export const GET: RequestHandler = async ({ url }) => {
  const path = resolveLocal(url.searchParams.get('path'))
  if (!path) return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  return json({ path, meta: await readAtlas(path) })
}

/**
 * Merge fields into a project's `.atlas`. `null` clears a field, which is how the UI drops an
 * override instead of pinning an empty string the scanner would then honour.
 */
export const PATCH: RequestHandler = async ({ request }) => {
  const { path: raw, patch } = await request.json()
  const path = resolveLocal(raw)
  if (!path) return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return json({ error: 'patch (object) required' }, { status: 400 })
  }
  return json({ path, meta: await patchAtlas(path, patch as AtlasMeta) })
}
