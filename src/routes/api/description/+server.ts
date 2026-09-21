import { json } from '@sveltejs/kit'
import { resolveLocal } from '$lib/config'
import { updateDescription } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const PUT: RequestHandler = async ({ request }) => {
  const { path, description } = await request.json()

  if (!path || typeof description !== 'string') {
    return json({ error: 'Missing path or description' }, { status: 400 })
  }

  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  await updateDescription(path, description)
  return json({ updated: true })
}
