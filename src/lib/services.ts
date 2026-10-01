import { execFile } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { connect, createServer, type Server } from 'node:net'
import { promisify } from 'node:util'
import { getServices, type ServiceDef } from '$shared/services'
import { ensureRoute, lanIp, SlugTakenError } from './caddyDev'
import { createMutex } from './mutex'
import { type BoundPort, isLoopback, listSockets, type Socket } from './ports'

const run = promisify(execFile)
const SSH_G_TIMEOUT_MS = 5000

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
  const { stdout } = await run('ssh', ['-G', 'nas'], { timeout: SSH_G_TIMEOUT_MS })
  const host = stdout.match(/^hostname (\S+)$/m)?.[1]
  return host ? (await lookup(host, { family: 4 })).address : null
}

/** Pure: the sockets on `port` as route candidates, minus the bridge atlas itself holds there. */
export function listenersOn(sockets: Socket[], port: number, bridgeIp?: string): BoundPort[] {
  const own = sockets.filter(
    (s) => s.port === port && !(s.pid === process.pid && s.address === bridgeIp),
  )
  return own.length ? [{ port, lanReachable: own.some((s) => !isLoopback(s.address)) }] : []
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

/**
 * Opens, keeps or closes the bridge under `key` to match `mode`. Returns an error line on failure.
 * A service's key is its slug; a project dev server's is `:<port>`.
 */
async function reconcileBridge(key: string, port: number, ip: string, mode: RouteMode) {
  const bridge = bridges.get(key)
  if (bridge && (mode !== 'bridge' || bridge.ip !== ip)) await closeBridge(key)
  if (mode !== 'bridge' || bridges.has(key)) return undefined
  try {
    bridges.set(key, { ip, server: await openBridge(ip, port) })
  } catch (e) {
    return `bridge on ${ip}:${port} failed — ${(e as Error).message}`
  }
}

/**
 * A project dev server that binds loopback only would 502 behind its hostname: give it the same
 * NAS-only bridge a service gets. Closes the bridge once the server binds the LAN or stops.
 * Called after `/api/run` routes a server, after a hostname-only assign, and on every sync.
 */
export async function bridgeProject(port: number, sockets?: Socket[]): Promise<string | undefined> {
  const key = `:${port}`
  const found = routeMode(listenersOn(sockets ?? (await listSockets()), port, bridges.get(key)?.ip))
  nasAddress ??= await resolveNas()
  return reconcileBridge(key, port, lanIp(), found)
}

async function route(svc: ServiceDef): Promise<Pick<ServiceState, 'local' | 'remote' | 'error'>> {
  const remote = svc.remote ?? false
  try {
    const names = await ensureRoute({
      slug: svc.slug,
      service: true,
      port: svc.port,
      remote,
      host: svc.host,
    })
    if (!names.nasSynced) return { local: null, error: names.error ?? 'NAS push failed' }
    return { local: names.local, ...(remote ? { remote: names.remote } : {}) }
  } catch (e) {
    if (e instanceof SlugTakenError) return { local: null, error: e.message }
    throw e
  }
}

async function syncOne(svc: ServiceDef, ip: string, sockets: Socket[]): Promise<ServiceState> {
  const mode = routeMode(listenersOn(sockets, svc.port, bridges.get(svc.slug)?.ip))
  const error = await reconcileBridge(svc.slug, svc.port, ip, mode)
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
 * Route every registered service. Cheap when nothing changed: one `netstat` for all services, and
 * `ensureRoute` is a local no-op for a route the NAS already has.
 */
export function syncServices(): Promise<ServiceState[]> {
  return withSyncLock(async () => {
    nasAddress = await resolveNas()
    const ip = lanIp()
    const sockets = await listSockets()
    const next: ServiceState[] = []
    for (const svc of getServices()) next.push(await syncOne(svc, ip, sockets))
    for (const key of [...bridges.keys()]) {
      if (key.startsWith(':')) await bridgeProject(Number(key.slice(1)), sockets)
    }
    states = next
    return states
  })
}

export function getServiceStates(): ServiceState[] {
  return states
}
