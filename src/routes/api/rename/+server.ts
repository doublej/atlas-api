import { rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { path, newName } = await request.json()

  if (!path || !newName) {
    return json({ error: 'Missing path or newName' }, { status: 400 })
  }

  if (newName.includes('/') || newName.includes('\\')) {
    return json({ error: 'Invalid name' }, { status: 400 })
  }

  const parentDir = dirname(path)
  const newPath = join(parentDir, newName)

  await rename(path, newPath)
  return json({ renamed: true, newPath })
}
