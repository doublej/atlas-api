import { json } from '@sveltejs/kit'
import { type AtlasMeta, patchAtlas, readAtlas } from '$lib/atlasFile'
import { DEV_FOLDER, resolveLocal } from '$lib/config'
import { assertPatchFree, rerouteProject } from '$lib/hostnames/claims'
import { slugProblem } from '$lib/hostnames/slug'
import { answeringTaken } from '$lib/hostnames/taken'
import { scan } from '$lib/scanner'
import type { RequestHandler } from './$types'

/** Read one project's `.atlas`. Absent file answers `{}` — not an error, just no overrides. */
export const GET: RequestHandler = async ({ url }) => {
  const path = resolveLocal(url.searchParams.get('path'))
  if (!path) return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  return json({ path, meta: await readAtlas(path) })
}

/** Why a patch can't be written, or null. `null` values (clear the key) always pass. */
function patchProblem(patch: AtlasMeta): string | null {
  if (patch.slug != null) {
    const problem = slugProblem(patch.slug)
    if (problem) return problem
  }
  const port = patch.port
  if (
    port != null &&
    !(Number.isInteger(port) && (port as number) >= 1024 && (port as number) <= 65535)
  ) {
    return 'port must be an integer 1024–65535'
  }
  return null
}

/**
 * Merge fields into a project's `.atlas`. `null` clears a field, which is how the UI drops an
 * override instead of pinning an empty string the scanner would then honour. A slug, port or
 * devPublic change on a project with a dev hostname moves that route with it (`hostname`).
 */
export const PATCH: RequestHandler = async ({ request }) => {
  const { path: raw, patch } = await request.json()
  const path = resolveLocal(raw)
  if (!path) return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return json({ error: 'patch (object) required' }, { status: 400 })
  }
  const problem = patchProblem(patch)
  if (problem) return json({ error: problem }, { status: 400 })

  return answeringTaken(async () => {
    await assertPatchFree(path, patch, (await scan(DEV_FOLDER)).projects) // before anything is written
    const atlas = await patchAtlas(path, patch as AtlasMeta)
    const hostname = await rerouteProject(path, atlas)
    return json({ path, atlas, ...(hostname ? { hostname } : {}) })
  })
}
