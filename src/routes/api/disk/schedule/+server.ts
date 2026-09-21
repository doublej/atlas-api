import { error, json } from '@sveltejs/kit'
import { checkArgs, diskJson, requireLocalRequest } from '$lib/disk'
import type { RequestHandler } from './$types'

/** `{ verb: enable|disable|set, job: scan|trim, at?: "Sun 10:00" }` → `atlas disk schedule …`. */
export const POST: RequestHandler = async ({ request }) => {
  requireLocalRequest(request)
  const { verb, job, at } = await request.json()
  if (!['enable', 'disable', 'set'].includes(verb)) error(400, 'verb is enable, disable or set')
  const args = [verb, job, ...(at ? ['--at', at] : [])]
  checkArgs('schedule', args)
  const r = await diskJson(['schedule', ...args])
  return json(r, { status: r.exit === 'error' ? 400 : 200 })
}
