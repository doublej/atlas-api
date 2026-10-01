import { json } from '@sveltejs/kit'
import { DEV_FOLDER, resolveLocal } from '$lib/config'
import { checkSlug } from '$lib/hostnames/claims'
import { scan } from '$lib/scanner'
import type { RequestHandler } from './$types'

/** Is `slug` free for the project at `path`? Always 200 — `status` carries the verdict. */
export const GET: RequestHandler = async ({ url }) => {
  const path = resolveLocal(url.searchParams.get('path'))
  if (!path) return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  const { projects } = await scan(DEV_FOLDER) // cached — the other projects' slugs
  return json(await checkSlug(url.searchParams.get('slug') ?? '', path, projects))
}
