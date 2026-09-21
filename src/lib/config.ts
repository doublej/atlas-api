import { join } from 'node:path'
import { getPrimaryHost } from '$shared/hosts'
import { resolveInCatalog } from './claude-tree'

/**
 * Default scan root — the development monorepo that the scanner walks, and the catalog
 * boundary every write path is confined to. It is the *primary* host's root: Fractal and
 * Ubuntu have their own roots in `shared/hosts.json` and are never written to.
 */
export const DEV_FOLDER = getPrimaryHost().root

/**
 * Where cookiecutter templates live. atlas is the authoritative resolver for
 * template versions/paths — never trust a generated project's stored path.
 * Override with `ATLAS_TEMPLATES_DIR`.
 */
export const ATLAS_TEMPLATES_DIR =
  process.env.ATLAS_TEMPLATES_DIR ?? join(DEV_FOLDER, '_management', 'cookiecutter-templates')

/**
 * The write boundary. Every route that touches a filesystem or a GUI runs `path` through this
 * first: it must be an absolute path inside *this* machine's catalog. A Fractal or Ubuntu path
 * resolves to null and the caller answers 400 — which is what keeps v1 read-only for remote
 * projects even if a consumer's action gating is out of date.
 */
export function resolveLocal(path: unknown): string | null {
  return typeof path === 'string' && path ? resolveInCatalog(path, DEV_FOLDER) : null
}
