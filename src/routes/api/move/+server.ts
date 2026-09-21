import { rename } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { json } from '@sveltejs/kit'
import { removeRouteByPath } from '$lib/caddyDev'
import { resolveLocal } from '$lib/config'
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

  await removeRouteByPath(sourcePath)
  await rename(sourcePath, newPath)
  return json({ moved: true, newPath })
}
