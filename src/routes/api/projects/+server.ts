import { json } from '@sveltejs/kit'
import { DEV_FOLDER } from '$lib/config'
import { refreshHosts } from '$lib/remoteScan'
import { scan } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const baseDir = url.searchParams.get('dir') || DEV_FOLDER
  const includeArchived = url.searchParams.get('includeArchived') === 'true'
  const index = await scan(baseDir)

  // One full record (`?path=<abs>`): what the console loads when a row opens, instead of the list.
  const path = url.searchParams.get('path')
  if (path) {
    const project = index.projects.find((p) => p.path === path)
    if (!project) return json({ error: `no project at ${path}` }, { status: 404 })
    return json(project)
  }

  // Same stale-while-revalidate bargain the local cache makes, one TTL up: never awaited, so
  // a powered-off Ubuntu costs this request nothing. Its projects land in the next scan.
  if (baseDir === DEV_FOLDER) refreshHosts().catch(() => {})

  if (!includeArchived) {
    index.projects = index.projects.filter((p) => !p.archived)
  }

  return json(index, { headers: { 'Cache-Control': 'max-age=60' } })
}
