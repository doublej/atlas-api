import { json } from '@sveltejs/kit'
import { ensureRoute, listHostnames, removeRouteByPath } from '$lib/caddyDev'
import { DEV_FOLDER, resolveLocal } from '$lib/config'
import { allocatePort, releaseAllocatedPort } from '$lib/ports'
import { currentSlug, scan, setPort, updateCachedPort } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async () => {
  return json(await listHostnames())
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

  const port = project.port ?? (await allocatePort(atlas))
  if (!project.port) {
    await setPort(path, port)
    await updateCachedPort(DEV_FOLDER, path, port)
    releaseAllocatedPort(port) // now covered by reservedPorts() via the patched cache instead
  }

  const slug = await currentSlug(project)
  const hostnames = await ensureRoute({
    slug,
    path,
    port,
    devPublic: project.devPublic,
  })

  return json({ slug, port, nasSynced: !!hostnames, ...hostnames })
}

export const DELETE: RequestHandler = async ({ request }) => {
  const { path } = await request.json()

  if (!path) {
    return json({ error: 'Missing path' }, { status: 400 })
  }

  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  await removeRouteByPath(path)
  return json({ removed: true })
}
