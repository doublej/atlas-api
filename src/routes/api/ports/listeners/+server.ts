import { json } from '@sveltejs/kit'
import { errorMessage } from '$lib/format'
import { getListeners } from '$lib/listeners'
import type { RequestHandler } from './$types'

/** Every TCP listener on this Mac, owner-joined, from the process snapshot. `?fresh=1` skips its 2s cache. */
export const GET: RequestHandler = async ({ url }) => {
  // Same as /api/processes: a snapshot that timed out under load is a 503 with the reason.
  const listeners = await getListeners(url.searchParams.get('fresh') === '1').catch(
    (e: unknown) => new Error(`process snapshot failed — ${errorMessage(e)}`),
  )
  if (listeners instanceof Error) return json({ error: listeners.message }, { status: 503 })
  return json(listeners)
}
