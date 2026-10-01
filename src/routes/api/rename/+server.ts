import { rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { json } from '@sveltejs/kit'
import { moveRoute } from '$lib/caddyDev'
import { resolveLocal } from '$lib/config'
import { planFolderMove } from '$lib/hostnames/claims'
import { answeringTaken } from '$lib/hostnames/taken'
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

  // The dev hostname follows the folder: same slug when `.atlas` pins it, else the new path's.
  return answeringTaken(async () => {
    const route = await planFolderMove(path, newPath)
    await rename(path, newPath)
    const hostname = route ? await moveRoute(newPath, route.from, route.to) : undefined
    return json({ renamed: true, newPath, ...(hostname ? { hostname } : {}) })
  })
}
