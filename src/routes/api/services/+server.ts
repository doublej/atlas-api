import { json } from '@sveltejs/kit'
import { getServiceStates, syncServices } from '$lib/services'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () => json({ services: getServiceStates() })

/** Sync now instead of waiting for the next 60s tick — not on a test instance (see `init`). */
export const POST: RequestHandler = async () =>
  process.env.ATLAS_SERVICE_SYNC === '0'
    ? json(
        { error: 'service sync is off on this instance (ATLAS_SERVICE_SYNC=0)' },
        { status: 409 },
      )
    : json({ services: await syncServices() })
