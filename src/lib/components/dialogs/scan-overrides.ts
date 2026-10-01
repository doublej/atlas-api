import type { AtlasConfig } from '$lib/atlasFile'

export type Detection = 'auto' | 'true' | 'false'

/**
 * `config` with one path's Detection and Scan depth applied. Every other key rides along as is:
 * `PUT /api/config` replaces the whole file, so a key left out here is a key deleted there.
 */
export function applyScanOverrides(
  config: AtlasConfig,
  rel: string,
  force: Detection,
  depth: string,
): AtlasConfig {
  const next: AtlasConfig = { ...config, depth: { ...config.depth }, force: { ...config.force } }

  if (force === 'auto') delete next.force[rel]
  else next.force[rel] = force === 'true'

  if (depth.trim() === '') delete next.depth[rel]
  else next.depth[rel] = Number(depth)

  return next
}
