import { homedir } from 'node:os'
import { join } from 'node:path'

/** Default scan root — the development monorepo that the scanner walks. */
export const DEV_FOLDER = join(homedir(), 'Documents', 'development')

/**
 * Where cookiecutter templates live. atlas is the authoritative resolver for
 * template versions/paths — never trust a generated project's stored path.
 * Override with `ATLAS_TEMPLATES_DIR`.
 */
export const ATLAS_TEMPLATES_DIR =
  process.env.ATLAS_TEMPLATES_DIR ?? join(DEV_FOLDER, '_management', 'cookiecutter-templates')
