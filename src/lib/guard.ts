// ── the request guard ─────────────────────────────────────────────────────────────────────────
// atlas-api has no login: it binds 127.0.0.1, and LAN/WAN traffic reaches it only through the NAS
// Caddy over the services bridge — so a proxied request *also* arrives from 127.0.0.1. Caddy
// rewrites `Host` to `localhost` and sets `x-forwarded-for`/`x-forwarded-host` itself (client-sent
// values are dropped; its only trusted proxy is its own loopback), which is what tells them apart.

const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/
/** The console's LAN hostnames. The NAS Caddy lets only LAN (and household) IPs through. */
const LAN_HOSTS = ['atlas.jurrejan.com', 'atlas.atlas.local.jurrejan.com']
/** Off-LAN, behind a Caddy password: read-only. */
const REMOTE_HOST = 'atlas.atlas.remote.jurrejan.com'

/**
 * Route ids answered only to this Mac and the LAN, whatever the method: they hand out file
 * contents (`claude-tree?path=` reads any file under ~/dev, `.env` included; `processes/log` a dev
 * server's output), reserve a port, or act on this Mac's screen (`iterm`, `finder`). Every other
 * GET is open — process lists included, since every command in them is redacted server-side —
 * and writes never are.
 */
const LOCAL_ONLY = [
  '/api/env-files',
  '/api/agent-files',
  '/api/claude-tree',
  '/api/ports/allocate',
  '/api/processes/log',
  '/api/iterm',
  '/api/finder',
]

/** `/api/projects?dir=` walks any folder the daemon can reach and writes its cache file into it. */
const isLocalOnly = (route: string, query: URLSearchParams) =>
  (route === '/api/projects' && Boolean(query.get('dir'))) ||
  LOCAL_ONLY.some((r) => route === r || route.startsWith(`${r}/`))

/**
 * A browser request from anywhere but `self` (CSRF). A cross-site `<img>` GET carries no `Origin`,
 * but every current browser sends `Sec-Fetch-Site`; non-browser clients send neither.
 */
function refuseForeign(headers: Headers, self: string): string | null {
  const origin = headers.get('origin')
  if (origin && origin !== self) return `cross-site request from ${origin}`
  const site = headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none')
    return `cross-site request (Sec-Fetch-Site: ${site})`
  return null
}

/**
 * A direct request: a loopback `Host` (DNS rebinding) and nothing from another origin (CSRF) — a
 * page from any other local dev server is just as foreign as one from the internet.
 */
function refuseDirect(headers: Headers): string | null {
  const host = headers.get('host') ?? '(none)'
  if (!LOOPBACK_HOST.test(host)) return `host ${host} is not this Mac`
  return refuseForeign(headers, `http://${host}`)
}

/** Through the NAS (`forwarded` is a known hostname): for a write that hostname's own `Origin`. */
function refuseProxied(headers: Headers, forwarded: string, write: boolean): string | null {
  if (forwarded === REMOTE_HOST) return write ? 'read-only off-LAN' : 'not available off-LAN'
  const origin = headers.get('origin')
  if (write && origin !== `https://${forwarded}`)
    return `write via ${forwarded} needs Origin https://${forwarded}, got ${origin ?? 'none'}`
  return refuseForeign(headers, `https://${forwarded}`)
}

/**
 * Why this request must be refused, or null to let it through. Writes (anything but GET/HEAD)
 * pass from this Mac or from a LAN hostname with that hostname's own `Origin`, which every
 * browser write carries. `route` is SvelteKit's route id, so an encoded path can't slip past.
 */
export function refusal(
  method: string,
  route: string,
  headers: Headers,
  query: URLSearchParams,
): string | null {
  const write = method !== 'GET' && method !== 'HEAD'
  const proxied = headers.has('x-forwarded-for')
  const forwarded = headers.get('x-forwarded-host') ?? '(none)'
  // Whatever routes another hostname here (a project entry on port 47891) is not the console, so
  // it gets nothing — not even the open reads.
  if (proxied && forwarded !== REMOTE_HOST && !LAN_HOSTS.includes(forwarded))
    return `unknown forwarded host ${forwarded}`
  if (!write && !isLocalOnly(route, query)) return null
  return proxied ? refuseProxied(headers, forwarded, write) : refuseDirect(headers)
}
