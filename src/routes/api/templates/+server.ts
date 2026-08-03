import { json } from '@sveltejs/kit'
import { ATLAS_TEMPLATES_DIR } from '$lib/config'
import { discoverTemplates } from '$lib/templates'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
  const templates = await discoverTemplates(ATLAS_TEMPLATES_DIR)
  return json({ templates })
}
