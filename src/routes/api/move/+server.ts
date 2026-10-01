import { rename } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { json } from '@sveltejs/kit'
import { resolveInsideCatalog, resolveLocal } from '$lib/config'
import { applyFolderMove, planFolderMove } from '$lib/hostnames/claims'
import { answeringTaken } from '$lib/hostnames/taken'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { sourcePath, targetDir } = await request.json()

  if (!sourcePath || !targetDir) {
    return json({ error: 'Missing sourcePath or targetDir' }, { status: 400 })
  }

  const source = resolveInsideCatalog(sourcePath)
  if (!source) {
    return json({ error: "sourcePath is not in this machine's catalog" }, { status: 400 })
  }
  // The catalog root is a valid destination; the folder that lands there must be inside it.
  const target = resolveLocal(targetDir)
  const newPath = target && resolveInsideCatalog(join(target, basename(source)))
  if (!newPath) {
    return json({ error: "targetDir is not in this machine's catalog" }, { status: 400 })
  }

  // The dev hostname follows the folder: same slug when `.atlas` pins it, else the new path's.
  return answeringTaken(async () => {
    const moves = await planFolderMove(source, newPath)
    await rename(source, newPath)
    const hostname = await applyFolderMove(moves, newPath)
    return json({ moved: true, newPath, ...(hostname ? { hostname } : {}) })
  })
}
