import { json } from '@sveltejs/kit'
import { getSnapshot } from '$lib/processes/snapshot'
import { parseViewQuery, viewOf } from '$lib/processes/view'
import type { RequestHandler } from './$types'

/** This Mac's processes as app rows (see `$lib/processes/types`). Development rows unless `all=1`. */
export const GET: RequestHandler = async ({ url }) => {
  const query = parseViewQuery(url.searchParams)
  if ('error' in query) return json(query, { status: 400 })
  return json(viewOf(await getSnapshot(url.searchParams.get('fresh') === '1'), query))
}
