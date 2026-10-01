import { rename } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { json } from '@sveltejs/kit'
import { moveRoute } from '$lib/caddyDev'
import { resolveLocal } from '$lib/config'
import { planFolderMove } from '$lib/hostnames/claims'
import { answeringTaken } from '$lib/hostnames/taken'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { sourcePath, targetDir } = await request.json()

  if (!sourcePath || !targetDir) {
    return json({ error: 'Missing sourcePath or targetDir' }, { status: 400 })
  }

  if (!resolveLocal(sourcePath)) {
    return json({ error: "sourcePath is not in this machine's catalog" }, { status: 400 })
  }
  if (!resolveLocal(targetDir)) {
    return json({ error: "targetDir is not in this machine's catalog" }, { status: 400 })
  }

  const name = basename(sourcePath)
  const newPath = join(targetDir, name)

  // The dev hostname follows the folder: same slug when `.atlas` pins it, else the new path's.
  return answeringTaken(async () => {
    const route = await planFolderMove(sourcePath, newPath)
    await rename(sourcePath, newPath)
    const hostname = route ? await moveRoute(newPath, route.from, route.to) : undefined
    return json({ moved: true, newPath, ...(hostname ? { hostname } : {}) })
  })
}
