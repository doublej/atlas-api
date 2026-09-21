import { json } from '@sveltejs/kit'
import { getListeners } from '$lib/listeners'
import type { RequestHandler } from './$types'

/** Every TCP listener on this Mac, owner-joined. `?fresh=1` skips the 10s cache. */
export const GET: RequestHandler = async ({ url }) =>
  json({
    listeners: await getListeners(url.searchParams.get('fresh') === '1'),
    updatedAt: new Date().toISOString(),
  })
