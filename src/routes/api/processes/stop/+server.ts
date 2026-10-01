import { json } from '@sveltejs/kit'
import { parseStopRequest, stopProcesses } from '$lib/processes/stop'
import type { RequestHandler } from './$types'

/** `{ targets: [{ pid, startedAt }], tree?, force?, dryRun? }` → `StopResponse`, 200 even when all are refused. */
export const POST: RequestHandler = async ({ request }) => {
  const req = parseStopRequest(await request.json().catch(() => null))
  if (typeof req === 'string') return json({ error: req }, { status: 400 })
  return json(await stopProcesses(req))
}
