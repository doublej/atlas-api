import { json } from '@sveltejs/kit'
import { DEV_FOLDER, resolveLocal } from '$lib/config'
import { TOOLBAR_ORIGIN } from '$lib/guard'
import { readRegistry } from '$lib/hostnames/registry'
import { type Project, scan } from '$lib/scanner'
import type { RequestHandler } from './$types'

/**
 * The injected toolbar's one route (`static/toolbar.js`). The guard let in only a project's LAN
 * dev hostname as `Origin`, and the slug in that origin picks the project: a page can act on its
 * own project and no other. Plain-text bodies keep the calls CORS-simple (no preflight).
 */
async function projectFor(origin: string): Promise<Project | null> {
  const slug = origin.match(TOOLBAR_ORIGIN)?.[1] ?? ''
  const registry = await readRegistry()
  const entry = Object.hasOwn(registry, slug) ? registry[slug] : undefined
  if (!entry?.path || entry.service || !resolveLocal(entry.path)) return null
  return (await scan(DEV_FOLDER)).projects.find((p) => p.path === entry.path) ?? null
}

/** Answers `origin`'s own project through `answer`, with the CORS header the page needs to read it. */
async function forOrigin(
  request: Request,
  answer: (project: Project) => Promise<[body: unknown, status?: number]>,
): Promise<Response> {
  const origin = request.headers.get('origin') ?? ''
  const project = await projectFor(origin)
  const [body, status] = project
    ? await answer(project)
    : [{ error: 'no atlas project on this hostname' }, 404]
  return json(body, { status, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } })
}

export const GET: RequestHandler = ({ request }) =>
  forOrigin(request, async (project) => [
    {
      name: project.name,
      canRestart: !!project.devCommand,
      console: `https://atlas.jurrejan.com/?q=${encodeURIComponent(project.slug)}`,
    },
  ])

/** `{ action: 'restart' | 'stop' }` → what `POST`/`DELETE /api/run` answered. */
export const POST: RequestHandler = ({ request, fetch }) =>
  forOrigin(request, async (project) => {
    const { action } = JSON.parse((await request.text()) || '{}')
    const { path, devCommand, runner } = project
    const call =
      action === 'stop'
        ? { method: 'DELETE', body: { path } }
        : action === 'restart' && devCommand
          ? { method: 'POST', body: { path, command: devCommand, runner: runner || 'npm' } }
          : null
    if (!call) return [{ error: `unknown action ${JSON.stringify(action)}` }, 400]
    const res = await fetch('/api/run', { method: call.method, body: JSON.stringify(call.body) })
    return [await res.json(), res.status]
  })
