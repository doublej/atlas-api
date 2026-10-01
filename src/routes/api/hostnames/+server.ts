import { json } from '@sveltejs/kit'
import { ensureRoute, listHostnames, removeRouteByPath } from '$lib/caddyDev'
import { DEV_FOLDER, resolveLocal } from '$lib/config'
import { assertSlugFree } from '$lib/hostnames/claims'
import { answeringTaken } from '$lib/hostnames/taken'
import { allocatePort, releaseAllocatedPort } from '$lib/ports'
import { currentSlug, scan, setPort, updateCachedPort } from '$lib/scanner'
import { bridgeProject } from '$lib/services'
import type { RequestHandler } from './$types'

/** Only what the NAS serves; `?all=1` adds failed and release-pending rows (with `state`). */
export const GET: RequestHandler = async ({ url }) => {
  return json(await listHostnames({ all: url.searchParams.get('all') === '1' }))
}

export const POST: RequestHandler = async ({ request }) => {
  const { path } = await request.json()

  if (!path) {
    return json({ error: 'Missing path' }, { status: 400 })
  }

  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  const atlas = await scan(DEV_FOLDER) // cached, stale-while-revalidate — no new fs walk
  const project = atlas.projects.find((p) => p.path === path)
  if (!project) {
    return json(
      { error: 'project not in the cached scan — POST /api/refresh first' },
      { status: 404 },
    )
  }

  const slug = await currentSlug(project)
  return answeringTaken(async () => {
    await assertSlugFree(slug, path) // before a port is reserved for a hostname it can't have
    const port = project.port ?? (await allocatePort(atlas))
    if (!project.port) {
      await setPort(path, port)
      await updateCachedPort(DEV_FOLDER, path, port)
      releaseAllocatedPort(port) // now covered by reservedPorts() via the patched cache instead
    }
    const state = await ensureRoute({ slug, path, port, devPublic: project.devPublic })
    // A dev server already up on loopback only gets the NAS-only bridge, or the hostname 502s.
    const bridgeError = state.nasSynced ? await bridgeProject(port) : undefined
    return json({ ...state, port, ...(bridgeError ? { error: bridgeError } : {}) })
  })
}

export const DELETE: RequestHandler = async ({ request }) => {
  const { path } = await request.json()

  if (!path) {
    return json({ error: 'Missing path' }, { status: 400 })
  }

  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  const removed = await removeRouteByPath(path)
  if (!removed.ok) {
    return json(
      { error: `NAS removal failed (the route stays, marked unsynced): ${removed.error}` },
      { status: 502 },
    )
  }
  return json({ removed: true })
}
