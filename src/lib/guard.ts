// ── the request guard ─────────────────────────────────────────────────────────────────────────
// atlas-api has no login: it binds 127.0.0.1, and LAN/WAN traffic reaches it only through the NAS
// Caddy over the services bridge — so a proxied request *also* arrives from 127.0.0.1. Caddy
// rewrites `Host` to `localhost` and sets `x-forwarded-for`/`x-forwarded-host` itself (client-sent
// values are dropped; its only trusted proxy is its own loopback), which is what tells them apart.

const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/
/** The console's LAN hostnames. The NAS Caddy lets only LAN (and household) IPs through. */
const LAN_HOSTS = ['atlas.jurrejan.com', 'atlas.atlas.local.jurrejan.com']
/** Off-LAN, behind a Caddy password: read-only. */
const REMOTE_HOST = 'atlas.atlas.remote.jurrejan.com'

/**
 * Route ids answered only to this Mac and the LAN, whatever the method: they hand out file
 * contents (`claude-tree?path=` reads any file under ~/dev, `.env` included), reserve a port, or
 * act on this Mac's screen (`iterm`, `finder`). Every other GET is open, writes never are.
 */
const LOCAL_ONLY = [
  '/api/env-files',
  '/api/agent-files',
  '/api/claude-tree',
  '/api/ports/allocate',
  '/api/iterm',
  '/api/finder',
]

const isLocalOnly = (route: string) =>
  LOCAL_ONLY.some((r) => route === r || route.startsWith(`${r}/`))

/** A direct request: a loopback `Host` (DNS rebinding) and no foreign `Origin` (CSRF). */
function refuseDirect(headers: Headers, origin: string | null): string | null {
  const host = headers.get('host') ?? '(none)'
  if (!LOOPBACK_HOST.test(host)) return `host ${host} is not this Mac`
  if (origin && !LOOPBACK_ORIGIN.test(origin)) return `cross-site request from ${origin}`
  return null
}

/** Through the NAS: a LAN hostname, and for a write that hostname's own `Origin`. */
function refuseProxied(headers: Headers, origin: string | null, write: boolean): string | null {
  const forwarded = headers.get('x-forwarded-host') ?? '(none)'
  if (forwarded === REMOTE_HOST) return write ? 'read-only off-LAN' : 'not available off-LAN'
  if (!LAN_HOSTS.includes(forwarded)) return `unknown forwarded host ${forwarded}`
  if (write && origin !== `https://${forwarded}`)
    return `write via ${forwarded} needs Origin https://${forwarded}, got ${origin ?? 'none'}`
  return null
}

/**
 * Why this request must be refused, or null to let it through. Writes (anything but GET/HEAD)
 * pass from this Mac or from a LAN hostname with that hostname's own `Origin`, which every
 * browser write carries. `route` is SvelteKit's route id, so an encoded path can't slip past.
 */
export function refusal(method: string, route: string, headers: Headers): string | null {
  const write = method !== 'GET' && method !== 'HEAD'
  if (!write && !isLocalOnly(route)) return null
  const origin = headers.get('origin')
  return headers.has('x-forwarded-for')
    ? refuseProxied(headers, origin, write)
    : refuseDirect(headers, origin)
}
