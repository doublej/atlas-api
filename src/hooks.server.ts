import { type Handle, json, type ServerInit } from '@sveltejs/kit'
import { building, dev } from '$app/environment'
import { refusal } from '$lib/guard'
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

/** One guard for every route (see `$lib/guard`). A load's own `fetch` was let in with its page. */
export const handle: Handle = ({ event, resolve }) => {
  if (event.isSubRequest) return resolve(event)
  const { method, headers } = event.request
  const reason = refusal(method, event.route.id ?? event.url.pathname, headers)
  return reason ? json({ error: reason }, { status: 403 }) : resolve(event)
}
