import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { getDaemons } from '$shared/daemons'
import { createMutex } from './mutex'
import type { Framework, ProjectAtlas } from './scanner'

const LSOF_TIMEOUT_MS = 5000

/** Dedicated range for atlas-allocated ports — kept clear of every ecosystem's own defaults (3000/5173/8000/5000/8080). */
export const ATLAS_PORT_RANGE = { min: 4100, max: 4999 }

/** Frameworks that bind a dev-server port; used to flag projects with no declared port. */
const PORT_BEARING_FRAMEWORKS = new Set<Framework>([
  'next',
  'react',
  'sveltekit',
  'svelte',
  'vite',
  'fastapi',
  'flask',
  'elysia',
])

export function checkPort(port: number): Promise<boolean | null> {
  return new Promise((resolve) => {
    const child = spawn('/usr/sbin/lsof', ['-i', `:${port}`])
    let hasOutput = false
    child.stdout.on('data', () => (hasOutput = true))
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, LSOF_TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(hasOutput)
      else if (code === 1) resolve(false)
      else resolve(null)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

function reservedPorts(atlas: ProjectAtlas): Set<number> {
  const reserved = new Set<number>()
  for (const d of getDaemons()) if (d.port) reserved.add(d.port)
  for (const p of atlas.projects) if (p.port) reserved.add(p.port)
  for (const p of allocatedThisProcess) reserved.add(p)
  return reserved
}

/**
 * Ports handed out by this daemon since it started, kept even after a caller's scan snapshot
 * catches up. Two concurrent `/api/run` calls both read `atlas` before either persists its
 * port, so `reservedPorts` alone can't see a sibling's in-flight allocation — this can. The
 * caller releases its hold (`releaseAllocatedPort`) once the port lands in the cache, so this
 * only ever covers the brief window between allocation and persistence.
 */
const allocatedThisProcess = new Set<number>()

/** Release the in-memory hold once `reservedPorts` can see the port through the cache instead. */
export function releaseAllocatedPort(port: number): void {
  allocatedThisProcess.delete(port)
}

const withAllocationLock = createMutex()

/**
 * Walk the atlas port range, skipping declared ports and anything `lsof` sees as live.
 * Serialized: `checkPort` awaits `lsof`, and two concurrent callers racing the same probe
 * would otherwise both read the port as free and return it.
 */
export function allocatePort(atlas: ProjectAtlas): Promise<number> {
  return withAllocationLock(() => allocatePortLocked(atlas))
}

async function allocatePortLocked(atlas: ProjectAtlas): Promise<number> {
  const reserved = reservedPorts(atlas)

  for (let port = ATLAS_PORT_RANGE.min; port <= ATLAS_PORT_RANGE.max; port++) {
    if (reserved.has(port)) continue

    const inUse = await checkPort(port)
    if (inUse === true) continue
    if (inUse === null)
      console.warn(`ports: lsof check timed out for port ${port} — allocating anyway`)

    allocatedThisProcess.add(port)
    return port
  }

  throw new Error(`No available port in range ${ATLAS_PORT_RANGE.min}-${ATLAS_PORT_RANGE.max}`)
}

export interface PortSource {
  kind: 'daemon' | 'project'
  label: string
  name: string
}

export interface PortCollision {
  port: number
  sources: PortSource[]
}

export interface UnmanagedProject {
  path: string
  relativePath: string
  framework: Framework
}

export interface PortAudit {
  collisions: PortCollision[]
  unmanaged: UnmanagedProject[]
}

/**
 * Report-only: never guesses or backfills a port into a project. Surfaces collisions
 * across daemons + scanned projects, and flags port-bearing frameworks with no declared
 * port. Known gap: Go/Rust/Swift projects don't get a distinct enough `framework` tag
 * today to be flagged here.
 */
export function auditPorts(atlas: ProjectAtlas): PortAudit {
  const bySource = new Map<number, PortSource[]>()

  for (const d of getDaemons()) {
    if (!d.port) continue
    const sources = bySource.get(d.port) ?? []
    sources.push({ kind: 'daemon', label: d.label, name: d.name })
    bySource.set(d.port, sources)
  }

  for (const p of atlas.projects) {
    if (!p.port) continue
    const sources = bySource.get(p.port) ?? []
    sources.push({ kind: 'project', label: p.relativePath, name: p.name })
    bySource.set(p.port, sources)
  }

  const collisions: PortCollision[] = [...bySource.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([port, sources]) => ({ port, sources }))
    .sort((a, b) => a.port - b.port)

  const unmanaged: UnmanagedProject[] = atlas.projects
    .filter((p) => p.framework && PORT_BEARING_FRAMEWORKS.has(p.framework) && !p.port)
    .map((p) => ({ path: p.path, relativePath: p.relativePath, framework: p.framework! }))

  return { collisions, unmanaged }
}

/** One TCP port a process group is listening on. */
export interface BoundPort {
  port: number
  /** Bound to a wildcard/LAN address — the only kind the NAS's Caddy can reach over the LAN. */
  lanReachable: boolean
}

const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost'])
const POLL_INTERVAL_MS = 400

/** Parse `lsof -Fn` name lines (`n*:5188`, `n127.0.0.1:8787`, `n[::1]:8787`) into ports. */
export function parseListeners(output: string): BoundPort[] {
  const found = new Map<number, boolean>()
  for (const line of output.split('\n')) {
    if (!line.startsWith('n')) continue
    const addr = line.slice(1)
    const sep = addr.lastIndexOf(':')
    if (sep === -1) continue
    const port = Number(addr.slice(sep + 1))
    if (!Number.isInteger(port) || port <= 0) continue
    const lanReachable = !LOOPBACK.has(addr.slice(0, sep))
    found.set(port, (found.get(port) ?? false) || lanReachable)
  }
  return [...found].map(([port, lanReachable]) => ({ port, lanReachable }))
}

/**
 * Which of a dev command's listeners its hostname should point at. LAN-reachable ones win
 * outright — Caddy proxies from the NAS to this machine's LAN IP and can't reach a loopback
 * bind at all. Within that pool the port atlas asked for wins, so a project that honours
 * `--port` (or declares one in `.atlas`) stays exactly where it was put; otherwise the lowest,
 * which on a frontend+API pair is the frontend (vite's 5188 over workerd's 8787).
 */
export function pickPort(ports: BoundPort[], preferred: number): BoundPort | null {
  const lan = ports.filter((p) => p.lanReachable).sort((a, b) => a.port - b.port)
  const pool = lan.length ? lan : [...ports].sort((a, b) => a.port - b.port)
  return pool.find((p) => p.port === preferred) ?? pool[0] ?? null
}

/** TCP ports process group `pgid` is listening on. Empty while nothing binds yet. */
function listeningPorts(pgid: number): Promise<BoundPort[]> {
  return new Promise((resolve) => {
    const child = spawn('/usr/sbin/lsof', [
      '-nP',
      '-iTCP',
      '-sTCP:LISTEN',
      '-a',
      '-g',
      String(pgid),
      '-Fn',
    ])
    let out = ''
    child.stdout.on('data', (chunk) => {
      out += chunk
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve([])
    }, LSOF_TIMEOUT_MS)
    child.on('close', () => {
      clearTimeout(timer)
      resolve(parseListeners(out))
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve([])
    })
  })
}

/**
 * Watch what a freshly spawned dev server actually binds, because atlas doesn't get to decide:
 * `--port` reaches a single-process script and nothing else. `spawn(…, { detached: true })`
 * makes the child a process-group leader, so its whole tree — vite's node, wrangler's workerd —
 * shares its pgid and shows up here. Resolves null when nothing binds before `timeoutMs`
 * (a build script, or a dev server that never came up).
 */
export async function discoverBoundPort(
  pgid: number,
  preferred: number,
  timeoutMs: number,
): Promise<BoundPort | null> {
  const deadline = Date.now() + timeoutMs
  let fallback: BoundPort | null = null

  while (Date.now() < deadline) {
    const found = pickPort(await listeningPorts(pgid), preferred)
    // A loopback-only hit this early is usually a side port (wrangler's inspector, a debugger),
    // so keep watching for a LAN-reachable one and only settle for it once time runs out.
    if (found?.lanReachable) return found
    fallback = found ?? fallback
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  return fallback
}

const FANS_OUT = /\b(concurrently|npm-run-all|run-p|run-s|turbo|pm2|honcho|foreman|overmind)\b/
const DECLARES_PORT = /(^|\s)(--port|-p)([\s=]|$)/
const DECLARES_HOST = /(^|\s)(--host|-H)([\s=]|$)/

/**
 * The `--port`/`--host` flags this npm script can still take. Only a single process forwarding
 * its argv acts on them: a script that fans out (concurrently, turbo, npm-run-all) swallows
 * them or dies, so it gets none and {@link discoverBoundPort} covers it. Each flag is decided
 * on its own — a script that pins its port still needs `--host 0.0.0.0`, or Vite binds
 * loopback and the dev hostname 502s at the NAS reverse-proxy hop.
 */
export function devFlags(script: string | undefined, port: number): string[] {
  if (script && FANS_OUT.test(script)) return []
  const flags: string[] = []
  if (!script || !DECLARES_PORT.test(script)) flags.push('--port', String(port))
  if (!script || !DECLARES_HOST.test(script)) flags.push('--host', '0.0.0.0')
  return flags
}

const execFileAsync = promisify(execFile)

/** Stdout of a command, or '' when it exits non-zero — lsof exits 1 for "nothing matched". */
export async function stdoutOf(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: LSOF_TIMEOUT_MS })
    return stdout
  } catch {
    return ''
  }
}

/**
 * Process groups listening on `port` from inside `path` — this project's own dev server,
 * whichever daemon life spawned it or whichever terminal it was left in. Derived from the OS
 * rather than remembered: an in-memory pid map died with every daemon restart and left the
 * old server squatting the port, so the next one shifted to port+1 behind a hostname still
 * routed to the old port. The daemon's own group is never a candidate.
 */
export async function projectListenerGroups(path: string, port: number): Promise<number[]> {
  const pids = (await stdoutOf('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']))
    .split('\n')
    .filter(Boolean)
  if (!pids.length) return []
  const cwds = await stdoutOf('/usr/sbin/lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fpn'])
  const inside = new Set<string>()
  let pid = ''
  for (const line of cwds.split('\n')) {
    if (line.startsWith('p')) pid = line.slice(1)
    else if (line.startsWith('n') && (line.slice(1) === path || line.startsWith(`n${path}/`)))
      inside.add(pid)
  }
  const groups = new Set<number>()
  for (const line of (await stdoutOf('/bin/ps', ['-o', 'pid=,pgid=', '-p', pids.join(',')])).split(
    '\n',
  )) {
    const [p, g] = line.trim().split(/\s+/)
    if (inside.has(p) && Number(p) !== process.pid && Number(g) !== process.pid)
      groups.add(Number(g))
  }
  return [...groups]
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Stop this project's dev server on `port` and wait for its whole process group to be gone,
 * so the next spawn finds the port free (a dying server still holds it for a moment, and Vite
 * would silently move to port+1) and the old runner's exit message lands in its own log, not
 * the freshly truncated one. Returns the groups it stopped.
 */
export async function stopProjectListeners(path: string, port: number): Promise<number[]> {
  const groups = await projectListenerGroups(path, port)
  for (const pgid of groups) if (groupAlive(pgid)) process.kill(-pgid, 'SIGTERM')
  const deadline = Date.now() + 3000
  while (Date.now() < deadline && groups.some(groupAlive))
    await new Promise((r) => setTimeout(r, 100))
  for (const pgid of groups) if (groupAlive(pgid)) process.kill(-pgid, 'SIGKILL')
  return groups
}
