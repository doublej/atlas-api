import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// Liveness only — no scan, no fs, no imports beyond kit. Consumers poll this to
// decide whether to restart the daemon, so it must never fail for a reason
// unrelated to the process being up (a broken UI route used to read as "dead").
export const GET: RequestHandler = () => json({ ok: true })
