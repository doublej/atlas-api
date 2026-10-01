import { json } from '@sveltejs/kit'
import { diagnose, fixDrift } from '$lib/hostnames/doctor'
import type { RequestHandler } from './$types'

/** Every way the registry, the projects, the services and the NAS disagree. */
export const GET: RequestHandler = async () => {
  return json({ checkedAt: new Date().toISOString(), items: await diagnose() })
}

/** Fix the given drift ids — every fixable one when `ids` is omitted — then report what remains. */
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}))
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((i: unknown) => typeof i === 'string')
    : undefined
  return json(await fixDrift(ids))
}
