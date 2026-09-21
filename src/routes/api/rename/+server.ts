import { rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { json } from '@sveltejs/kit'
import { removeRouteByPath } from '$lib/caddyDev'
import { resolveLocal } from '$lib/config'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { path, newName } = await request.json()

  if (!path || !newName) {
    return json({ error: 'Missing path or newName' }, { status: 400 })
  }

  if (newName.includes('/') || newName.includes('\\')) {
    return json({ error: 'Invalid name' }, { status: 400 })
  }

  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  const parentDir = dirname(path)
  const newPath = join(parentDir, newName)

  await removeRouteByPath(path)
  await rename(path, newPath)
  return json({ renamed: true, newPath })
}
