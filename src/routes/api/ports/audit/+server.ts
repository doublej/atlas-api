import { json } from '@sveltejs/kit'
import { DEV_FOLDER } from '$lib/config'
import { auditPorts } from '$lib/ports'
import { scan } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
  const atlas = await scan(DEV_FOLDER) // cached, stale-while-revalidate — no new fs walk
  return json(auditPorts(atlas))
}
