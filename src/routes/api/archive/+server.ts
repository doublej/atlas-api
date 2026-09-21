import { json } from '@sveltejs/kit'
import { removeRouteByPath } from '$lib/caddyDev'
import { resolveLocal } from '$lib/config'
import { setArchived } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request }) => {
  const { path, archived } = await request.json()
  if (!path || typeof archived !== 'boolean') {
    return json({ error: 'path (string) and archived (boolean) required' }, { status: 400 })
  }

  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  await setArchived(path, archived)
  if (archived) await removeRouteByPath(path)
  return json({ ok: true, path, archived })
}
