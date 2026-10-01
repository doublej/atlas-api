import { json } from '@sveltejs/kit'
import { errorMessage } from '$lib/format'
import { getSnapshot } from '$lib/processes/snapshot'
import { parseViewQuery, viewOf } from '$lib/processes/view'
import type { RequestHandler } from './$types'

/** This Mac's processes as app rows (see `$lib/processes/types`). Development rows unless `all=1`. */
export const GET: RequestHandler = async ({ url }) => {
  const query = parseViewQuery(url.searchParams)
  if ('error' in query) return json(query, { status: 400 })
  // A command timing out on a loaded Mac is expected: a 503 with the reason, not a bare 500.
  const snap = await getSnapshot(url.searchParams.get('fresh') === '1').catch((e: unknown) => {
    return new Error(`process snapshot failed — ${errorMessage(e)}`)
  })
  if (snap instanceof Error) return json({ error: snap.message }, { status: 503 })
  return json(viewOf(snap, query))
}
