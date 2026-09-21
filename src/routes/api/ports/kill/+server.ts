import { json } from '@sveltejs/kit'
import { killListeners } from '$lib/listeners'
import type { RequestHandler } from './$types'

/** `{ pids }` → SIGKILL, limited to processes the listener scan saw. */
export const POST: RequestHandler = async ({ request }) => {
  const { pids } = await request.json()
  if (!Array.isArray(pids) || !pids.every(Number.isInteger)) {
    return json({ error: 'pids must be an array of integers' }, { status: 400 })
  }
  return json({ results: await killListeners(pids) })
}
