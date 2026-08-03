import { json } from '@sveltejs/kit'
import { getGitStatus } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { paths } = await request.json()

  if (!paths || !Array.isArray(paths)) {
    return json({ error: 'Missing paths array' }, { status: 400 })
  }

  const results = await Promise.all(
    paths.map(async (path: string) => {
      const info = await getGitStatus(path)
      return { path, ...info }
    }),
  )

  return json(results)
}
