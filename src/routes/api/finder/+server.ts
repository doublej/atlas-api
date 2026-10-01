import { execFile } from 'node:child_process'
import { json } from '@sveltejs/kit'
import { resolveLocal } from '$lib/config'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { path } = await request.json()

  if (!path) {
    return json({ error: 'Missing path' }, { status: 400 })
  }

  const resolved = resolveLocal(path)
  if (!resolved) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  // No shell: `$(…)` or a `"` in a folder name is just part of the path.
  return new Promise((resolve) => {
    execFile('open', [resolved], (error) => {
      if (error) {
        resolve(json({ error: error.message }, { status: 500 }))
      } else {
        resolve(json({ opened: true }))
      }
    })
  })
}
