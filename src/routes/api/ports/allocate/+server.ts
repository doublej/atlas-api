import { json } from '@sveltejs/kit'
import { DEV_FOLDER } from '$lib/config'
import { allocatePort } from '$lib/ports'
import { scan } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
  const atlas = await scan(DEV_FOLDER) // cached, stale-while-revalidate — no new fs walk
  try {
    const port = await allocatePort(atlas)
    return json({ port })
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Failed to allocate port' },
      { status: 500 },
    )
  }
}
