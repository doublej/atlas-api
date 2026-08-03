import { exec } from 'node:child_process'
import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { path } = await request.json()

  if (!path) {
    return json({ error: 'Missing path' }, { status: 400 })
  }

  return new Promise((resolve) => {
    exec(`open "${path}"`, (error) => {
      if (error) {
        resolve(json({ error: error.message }, { status: 500 }))
      } else {
        resolve(json({ opened: true }))
      }
    })
  })
}
