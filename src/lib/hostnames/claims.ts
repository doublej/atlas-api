import { relative } from 'node:path'
import { moveRoute, SlugTakenError } from '../caddyDev'
import { DEV_FOLDER } from '../config'
import { currentSlug, type Project } from '../scanner'
import { describeHolder, hostnamesFor, readRegistry, rowHolder, slugsAt } from './registry'
import { slugProblem } from './slug'
import type { Holder, HostnameState, SlugCheck } from './types'

// Who may have which slug: every slug write (assign, run, a `.atlas` edit, a folder move) asks here.

type Claimant = Pick<Project, 'path' | 'slug' | 'name' | 'isLocal'>

/**
 * Who holds `slug` against the project at `path`: a registry row, a service, or another local
 * project whose (scanned) slug it already is. Null when it is free for this project.
 */
export async function slugHolder(
  slug: string,
  path: string,
  projects: Claimant[] = [],
): Promise<Holder | null> {
  const row = rowHolder(slug, (await readRegistry())[slug], { path })
  if (row) return row
  const other = projects.find((p) => p.isLocal && p.slug === slug && p.path !== path)
  return other ? { kind: 'project', name: other.name, path: other.path } : null
}

/** Throws {@link SlugTakenError} when {@link slugHolder} finds one. */
export async function assertSlugFree(
  slug: string,
  path: string,
  projects: Claimant[] = [],
): Promise<void> {
  const holder = await slugHolder(slug, path, projects)
  if (holder) throw new SlugTakenError(slug, holder)
}

/** The verdict on `slug` for the project at `path`, with the URLs it would get. */
export async function checkSlug(
  slug: string,
  path: string,
  projects: Claimant[],
): Promise<SlugCheck> {
  const names = hostnamesFor(slug)
  const reason = slugProblem(slug)
  if (reason) return { slug, status: 'invalid', reason, ...names }
  const holder = await slugHolder(slug, path, projects)
  if (holder)
    return { slug, status: 'taken', reason: describeHolder(slug, holder), holder, ...names }
  const own = (await readRegistry())[slug]?.path === path || (await slugAt(path)) === slug
  return { slug, status: own ? 'current' : 'free', ...names }
}

/** The slug a project at `path` gets from its `.atlas` (or its folder) right now. */
export function slugAt(path: string, folder = path): Promise<string> {
  return currentSlug({ path, relativePath: relative(DEV_FOLDER, folder) })
}

/**
 * What a folder rename/move does to the project's route, decided before the folder moves (the
 * `.atlas` is still at `from`). Null without a route; throws {@link SlugTakenError} when the
 * new folder's slug belongs to someone else.
 */
export async function planFolderMove(
  from: string,
  to: string,
): Promise<{ from: string; to: string } | null> {
  const registry = await readRegistry()
  const slug = slugsAt(registry, from)[0]
  if (!slug) return null
  const next = await slugAt(from, to)
  const holder = next === slug ? null : rowHolder(next, registry[next], { path: to })
  if (holder) throw new SlugTakenError(next, holder)
  return { from: slug, to: next }
}

/**
 * After a `.atlas` write: carry the project's route, if it has one, to its slug, port and
 * devPublic as they are now. Undefined when there is no route or nothing route-relevant changed.
 */
export async function rerouteProject(
  path: string,
  meta: Record<string, unknown>,
): Promise<HostnameState | undefined> {
  const registry = await readRegistry()
  const from = slugsAt(registry, path)[0]
  if (!from) return undefined
  const row = registry[from]
  const to = await slugAt(path)
  const port = typeof meta.port === 'number' ? meta.port : row.port
  const devPublic = meta.devPublic === true
  if (to === from && port === row.port && devPublic === (row.devPublic ?? false)) return undefined
  return moveRoute(path, from, to, { port, devPublic })
}
