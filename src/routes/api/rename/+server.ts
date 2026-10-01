import { rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { json } from '@sveltejs/kit'
import { resolveInsideCatalog } from '$lib/config'
import { applyFolderMove, planFolderMove } from '$lib/hostnames/claims'
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

  const source = resolveInsideCatalog(path)
  if (!source) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  const newPath = resolveInsideCatalog(join(dirname(source), newName))
  if (!newPath) {
    return json({ error: 'Invalid name' }, { status: 400 })
  }

  // The dev hostname follows the folder: same slug when `.atlas` pins it, else the new path's.
  return answeringTaken(async () => {
    const moves = await planFolderMove(source, newPath)
    await rename(source, newPath)
    const hostname = await applyFolderMove(moves, newPath)
    return json({ renamed: true, newPath, ...(hostname ? { hostname } : {}) })
  })
}
