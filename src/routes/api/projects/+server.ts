import { json } from '@sveltejs/kit'
import { DEV_FOLDER } from '$lib/config'
import { scan } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ url }) => {
  const baseDir = url.searchParams.get('dir') || DEV_FOLDER
  const includeArchived = url.searchParams.get('includeArchived') === 'true'
  const index = await scan(baseDir)

  if (!includeArchived) {
    index.projects = index.projects.filter((p) => !p.archived)
  }

  return json(index, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=60',
    },
  })
}
