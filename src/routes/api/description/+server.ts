import { json } from '@sveltejs/kit'
import { updateDescription } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const PUT: RequestHandler = async ({ request }) => {
  const { path, description } = await request.json()

  if (!path || typeof description !== 'string') {
    return json({ error: 'Missing path or description' }, { status: 400 })
  }

  await updateDescription(path, description)
  return json({ updated: true })
}
