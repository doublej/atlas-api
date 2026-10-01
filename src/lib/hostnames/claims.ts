import { existsSync } from 'node:fs'
import { relative } from 'node:path'
import { type AtlasMeta, readAtlas } from '../atlasFile'
import { moveRoute, SlugTakenError } from '../caddyDev'
import { DEV_FOLDER } from '../config'
import { currentSlug, type Project, slugify } from '../scanner'
import {
  describeHolder,
  type HostnameEntry,
  hostnamesFor,
  type Registry,
  readRegistry,
  rowHolder,
  slugsAt,
} from './registry'
import { slugProblem } from './slug'
import type { Holder, HostnameState, SlugCheck } from './types'

// Who may have which slug: every slug write (assign, run, a `.atlas` edit, a folder move) asks here.

type Claimant = Pick<Project, 'path' | 'slug' | 'name' | 'isLocal'>

/** The project's live route: a release-pending row is on its way out, not the project's route. */
const routeAt = (registry: Registry, path: string): string | undefined =>
  slugsAt(registry, path).find((s) => !registry[s].release)

/**
 * Who holds `slug` against the project at `path`: a registry row, a service, or another local
 * project whose (scanned) slug it already is. Null when it is free for this project. Without
 * `path` nobody claims it, so any holder counts.
 */
export async function slugHolder(
  slug: string,
  path: string | undefined,
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

/**
 * Throws {@link SlugTakenError} before a `.atlas` write when the slug the project ends up with
 * belongs to someone else — {@link rerouteProject} moves the route there once the file is
 * written. Compared with the route's slug when there is one (a hand-edited `.atlas` may have
 * drifted from it), else with the slug the project has now.
 */
export async function assertPatchFree(
  path: string,
  patch: AtlasMeta,
  projects: Claimant[],
): Promise<void> {
  const merged = { ...(await readAtlas(path)), ...patch } // `null` clears, as in patchAtlas
  const next =
    typeof merged.slug === 'string' && merged.slug
      ? slugify(merged.slug)
      : slugify(relative(DEV_FOLDER, path)) // as currentSlug reads it
  const route = routeAt(await readRegistry(), path)
  if (next !== (route ?? (await slugAt(path)))) await assertSlugFree(next, path, projects)
}

/** The verdict on `slug` for the project at `path` (none: never `current`), with its URLs. */
export async function checkSlug(
  slug: string,
  path: string | undefined,
  projects: Claimant[],
): Promise<SlugCheck> {
  const names = hostnamesFor(slug)
  const reason = slugProblem(slug)
  if (reason) return { slug, status: 'invalid', reason, ...names }
  const holder = await slugHolder(slug, path, projects)
  if (holder)
    return { slug, status: 'taken', reason: describeHolder(slug, holder), holder, ...names }
  const own =
    path !== undefined &&
    ((await readRegistry())[slug]?.path === path || (await slugAt(path)) === slug)
  return { slug, status: own ? 'current' : 'free', ...names }
}

/** The slug a project at `path` gets from its `.atlas` (or its folder) right now. */
export function slugAt(path: string, folder = path): Promise<string> {
  return currentSlug({ path, relativePath: relative(DEV_FOLDER, folder) })
}

export interface FolderMove {
  /** Where the routed project's folder ends up. */
  path: string
  from: string
  to: string
}

/** The folder of a live row at or under `from`, which moves with it; undefined for any other row. */
function movingFolder(row: HostnameEntry, from: string): string | undefined {
  const path = row.path
  if (row.release || !path || (path !== from && !path.startsWith(`${from}/`))) return undefined
  return existsSync(path) ? path : undefined // an orphan row: its folder isn't the one moving
}

/**
 * What a folder rename/move does to the routes of the projects at or under `from`, decided
 * before the folder moves (each `.atlas` is still at its old path). Throws
 * {@link SlugTakenError} when a new folder's slug belongs to someone else.
 */
export async function planFolderMove(from: string, to: string): Promise<FolderMove[]> {
  const registry = await readRegistry()
  const moves: FolderMove[] = []
  for (const [slug, row] of Object.entries(registry)) {
    const old = movingFolder(row, from)
    if (!old) continue
    const path = to + old.slice(from.length)
    const next = await slugAt(old, path)
    // A row at the same folder is the mover's own, left behind by a half-finished move.
    const own = next === slug || registry[next]?.path === old
    const holder = own ? null : rowHolder(next, registry[next], { path })
    if (holder) throw new SlugTakenError(next, holder)
    moves.push({ path, from: slug, to: next })
  }
  return moves
}

/** After the folder moved: carry every planned route. The state of the route at `to`, if any. */
export async function applyFolderMove(
  moves: FolderMove[],
  to: string,
): Promise<HostnameState | undefined> {
  let own: HostnameState | undefined
  for (const m of moves) {
    const state = await moveRoute(m.path, m.from, m.to)
    if (m.path === to) own = state
  }
  return own
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
  const from = routeAt(registry, path)
  if (!from) return undefined
  const row = registry[from]
  const to = await slugAt(path)
  const port = typeof meta.port === 'number' ? meta.port : row.port
  const devPublic = meta.devPublic === true
  if (to === from && port === row.port && devPublic === (row.devPublic ?? false)) return undefined
  return moveRoute(path, from, to, { port, devPublic })
}
