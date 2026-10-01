import type { ServerInit } from '@sveltejs/kit'
import { building, dev } from '$app/environment'
import { syncServices } from '$lib/services'

const SERVICE_SYNC_MS = 60_000

/**
 * The daemon keeps service hostnames routed; `vite dev` stays off the shared NAS Caddy, and so does
 * a second build started with `ATLAS_SERVICE_SYNC=0` (a worktree's test instance).
 */
export const init: ServerInit = () => {
  if (dev || building || process.env.ATLAS_SERVICE_SYNC === '0') return
  const sync = () =>
    syncServices().catch((e) => console.warn(`services: sync failed — ${(e as Error).message}`))
  sync()
  setInterval(sync, SERVICE_SYNC_MS).unref()
}
