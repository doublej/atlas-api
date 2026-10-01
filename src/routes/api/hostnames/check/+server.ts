import { relative } from 'node:path'
import { json } from '@sveltejs/kit'
import { DEV_FOLDER, resolveLocal } from '$lib/config'
import { checkSlug } from '$lib/hostnames/claims'
import { scan, slugify } from '$lib/scanner'
import type { RequestHandler } from './$types'

/**
 * Is `slug` free for the project at `path`? Always 200 — `status` carries the verdict. An empty
 * `slug` checks the one the folder gives (what clearing the `.atlas` override would leave).
 * Without `path` (a CLI outside any project) nobody claims it: free, taken or invalid.
 */
export const GET: RequestHandler = async ({ url }) => {
  const given = url.searchParams.get('path')
  const path = given ? resolveLocal(given) : undefined
  if (path === null) return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  const slug = url.searchParams.get('slug') || (path ? slugify(relative(DEV_FOLDER, path)) : '')
  const { projects } = await scan(DEV_FOLDER) // cached — the other projects' slugs
  return json(await checkSlug(slug, path, projects))
}
