import { json } from '@sveltejs/kit'
import { getReadme } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { path } = await request.json()
  const readme = await getReadme(path)
  return json({ readme })
}
