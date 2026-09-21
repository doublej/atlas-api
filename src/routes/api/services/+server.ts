import { json } from '@sveltejs/kit'
import { getServiceStates, syncServices } from '$lib/services'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () => json({ services: getServiceStates() })

/** Sync now instead of waiting for the next 60s tick. */
export const POST: RequestHandler = async () => json({ services: await syncServices() })
