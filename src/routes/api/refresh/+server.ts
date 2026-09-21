import { join } from 'node:path'
import { json } from '@sveltejs/kit'
import { DEV_FOLDER } from '$lib/config'
import { refreshHosts } from '$lib/remoteScan'
import { enrichCacheWithGit, scan } from '$lib/scanner'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ url }) => {
  const hostId = url.searchParams.get('host') ?? undefined
  const force = url.searchParams.get('force') === 'true' || Boolean(hostId)

  // Refreshing a named host is the one case worth waiting for — it is an explicit
  // "go look at Fractal now". The unnamed sweep stays in the background.
  if (hostId) await refreshHosts({ hostId, force })
  else refreshHosts({ force }).catch(() => {})

  const result = await scan(DEV_FOLDER, { skipGit: true, forceRefresh: true })

  // Background: enrich cache with git statuses for next cold start
  const cachePath = join(DEV_FOLDER, '.atlas-cache.json')
  const { fromCache, stale, ...atlas } = result
  enrichCacheWithGit(cachePath, atlas, DEV_FOLDER).catch(() => {})

  return json(result)
}
