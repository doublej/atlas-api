import { json } from '@sveltejs/kit'
import { errorMessage } from '$lib/format'
import { parseStopRequest, stopProcesses } from '$lib/processes/stop'
import type { RequestHandler } from './$types'

/** `{ targets: [{ pid, startedAt }], tree?, force?, dryRun? }` → `StopResponse`, 200 even when all are refused. */
export const POST: RequestHandler = async ({ request }) => {
  const req = parseStopRequest(await request.json().catch(() => null))
  if (typeof req === 'string') return json({ error: req }, { status: 400 })
  // ps/launchctl timing out under load: a 503 with the reason (nothing was signalled), not a bare 500.
  const res = await stopProcesses(req).catch(
    (e: unknown) => new Error(`stop failed — ${errorMessage(e)}`),
  )
  if (res instanceof Error) return json({ error: res.message }, { status: 503 })
  return json(res)
}
