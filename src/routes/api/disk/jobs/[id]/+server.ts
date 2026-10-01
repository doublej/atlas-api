import { json } from '@sveltejs/kit'
import { cancelJob, readJob } from '$lib/disk'
import type { RequestHandler } from './$types'

/** Poll: the log from `?offset=` on, and whether (and how) the job ended. */
export const GET: RequestHandler = ({ params, url }) =>
  json(readJob(params.id, Math.max(0, Number(url.searchParams.get('offset')) || 0)))

/** Cancel: SIGINT to the job's process group. */
export const DELETE: RequestHandler = ({ params }) => {
  cancelJob(params.id)
  return json({ ok: true })
}
