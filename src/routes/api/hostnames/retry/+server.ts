import { json } from '@sveltejs/kit'
import { retryRoute } from '$lib/caddyDev'
import { answeringTaken } from '$lib/hostnames/taken'
import type { RequestHandler } from './$types'

/** Push an unsynced row again, or finish a release whose NAS removal failed. */
export const POST: RequestHandler = async ({ request }) => {
  const { slug } = await request.json()
  if (typeof slug !== 'string' || !slug) return json({ error: 'slug required' }, { status: 400 })
  return answeringTaken(async () => json(await retryRoute(slug)))
}
