import { rename } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { sourcePath, targetDir } = await request.json()

  if (!sourcePath || !targetDir) {
    return json({ error: 'Missing sourcePath or targetDir' }, { status: 400 })
  }

  const name = basename(sourcePath)
  const newPath = join(targetDir, name)

  await rename(sourcePath, newPath)
  return json({ moved: true, newPath })
}
