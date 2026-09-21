import { execFile } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { connect, createServer, type Server } from 'node:net'
import { promisify } from 'node:util'
import { getServices, type ServiceDef } from '$shared/services'
import { ensureRoute, lanIp } from './caddyDev'
import { createMutex } from './mutex'
import { type BoundPort, parseListeners } from './ports'

const run = promisify(execFile)
const LSOF_TIMEOUT_MS = 5000

/**
 * How the NAS reaches a service: `direct` to its own wildcard/LAN bind, `bridge` through a
 * forwarder atlas opens on the LAN IP because the service binds loopback only, `down` when
 * nothing listens.
 */
export type RouteMode = 'direct' | 'bridge' | 'down'

export interface ServiceState {
  slug: string
  name: string
  port: number
  mode: RouteMode
  bridged: boolean
  local: string | null
  remote?: string | null
  error?: string
}

/** Pure: the listeners on one port decide the route. */
export function routeMode(listeners: BoundPort[]): RouteMode {
  if (listeners.length === 0) return 'down'
  return listeners.some((l) => l.lanReachable) ? 'direct' : 'bridge'
}

interface Bridge {
  ip: string
  server: Server
}

const bridges = new Map<string, Bridge>()
let states: ServiceState[] = []
/** The one peer a bridge accepts. Re-resolved every sync, never written anywhere. */
let nasAddress: string | null = null

/** `ssh -G nas` → the NAS's current IPv4, the same way `caddyDev` reaches it. */
async function resolveNas(): Promise<string | null> {
  const { stdout } = await run('ssh', ['-G', 'nas'], { timeout: LSOF_TIMEOUT_MS })
  const host = stdout.match(/^hostname (\S+)$/m)?.[1]
  return host ? (await lookup(host, { family: 4 })).address : null
}

/** Listeners on `port`, minus the bridge atlas itself holds there. */
async function listenersOn(port: number, bridge: Bridge | undefined): Promise<BoundPort[]> {
  // lsof exits 1 when nothing listens — that is an answer, not a failure.
  const out = await run('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fn'], {
    timeout: LSOF_TIMEOUT_MS,
  }).then(
    (r) => r.stdout,
    (e: { code?: number; stdout?: string }) => (e.code === 1 ? '' : Promise.reject(e)),
  )
  const own = bridge ? `n${bridge.ip}:${port}` : null
  return parseListeners(
    out
      .split('\n')
      .filter((l) => l !== own)
      .join('\n'),
  )
}

/**
 * Forward `ip:port` → `127.0.0.1:port` for the NAS alone. Binding the specific LAN address
 * leaves the service's own loopback bind untouched; every other peer is dropped on connect, so
 * the LAN gains no unauthenticated path to a loopback-only UI.
 */
function openBridge(ip: string, port: number): Promise<Server> {
  const server = createServer((client) => {
    if (client.remoteAddress?.replace(/^::ffff:/, '') !== nasAddress) {
      client.destroy()
      return
    }
    const upstream = connect(port, '127.0.0.1')
    const close = () => {
      client.destroy()
      upstream.destroy()
    }
    client.on('error', close)
    upstream.on('error', close)
    client.pipe(upstream).pipe(client)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, ip, () => resolve(server))
  })
}

function closeBridge(slug: string): Promise<void> {
  const bridge = bridges.get(slug)
  bridges.delete(slug)
  return new Promise((resolve) => (bridge ? bridge.server.close(() => resolve()) : resolve()))
}

/** Opens, keeps or closes the service's bridge to match `mode`. Returns an error line on failure. */
async function reconcileBridge(svc: ServiceDef, ip: string, mode: RouteMode) {
  const bridge = bridges.get(svc.slug)
  if (bridge && (mode !== 'bridge' || bridge.ip !== ip)) await closeBridge(svc.slug)
  if (mode !== 'bridge' || bridges.has(svc.slug)) return undefined
  try {
    bridges.set(svc.slug, { ip, server: await openBridge(ip, svc.port) })
  } catch (e) {
    return `bridge on ${ip}:${svc.port} failed — ${(e as Error).message}`
  }
}

async function route(svc: ServiceDef): Promise<Pick<ServiceState, 'local' | 'remote' | 'error'>> {
  const remote = svc.remote ?? false
  const names = await ensureRoute({ slug: svc.slug, service: true, port: svc.port, remote })
  if (!names) return { local: null, error: 'NAS push failed or slug taken — see daemon log' }
  return { local: names.local, ...(remote ? { remote: names.remote } : {}) }
}

async function syncOne(svc: ServiceDef, ip: string): Promise<ServiceState> {
  const mode = routeMode(await listenersOn(svc.port, bridges.get(svc.slug)))
  const error = await reconcileBridge(svc, ip, mode)
  const base = {
    slug: svc.slug,
    name: svc.name,
    port: svc.port,
    mode,
    bridged: bridges.has(svc.slug),
  }
  // Down: no route push — an existing one just 502s until the service is back.
  if (mode === 'down' || error) return { ...base, local: null, error }
  return { ...base, ...(await route(svc)) }
}

const withSyncLock = createMutex()

/**
 * Route every registered service. Cheap when nothing changed: one `lsof` per service, and
 * `ensureRoute` is a local no-op for a route the NAS already has.
 */
export function syncServices(): Promise<ServiceState[]> {
  return withSyncLock(async () => {
    nasAddress = await resolveNas()
    const ip = lanIp()
    const next: ServiceState[] = []
    for (const svc of getServices()) next.push(await syncOne(svc, ip))
    states = next
    return states
  })
}

export function getServiceStates(): ServiceState[] {
  return states
}
