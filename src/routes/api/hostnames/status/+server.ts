import { json } from '@sveltejs/kit'
import { hostnameState } from '$lib/caddyDev'
import type { RequestHandler } from './$types'

/** One slug's `HostnameState` — the tracker's view right after a push, the registry's otherwise. */
export const GET: RequestHandler = async ({ url }) => {
  const slug = url.searchParams.get('slug')
  if (!slug) return json({ error: 'slug required' }, { status: 400 })
  return json(await hostnameState(slug))
}
