import { json } from '@sveltejs/kit'
import { getListeners } from '$lib/listeners'
import type { RequestHandler } from './$types'

/** Every TCP listener on this Mac, owner-joined, from the process snapshot. `?fresh=1` skips its 2s cache. */
export const GET: RequestHandler = async ({ url }) =>
  json(await getListeners(url.searchParams.get('fresh') === '1'))
