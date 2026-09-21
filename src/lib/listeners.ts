import { basename } from 'node:path'
import { getServices } from '$shared/services'
import { listHostnames } from './caddyDev'
import { DEV_FOLDER } from './config'
import { stdoutOf } from './ports'
import { type Project, scan } from './scanner'

/**
 * Every TCP listener on this Mac, joined with what atlas knows about it — the Active Ports
 * dashboard, folded into the console. Grouped by who owns the port, not by a hand-kept category.
 */
export type ListenerGroup = 'project' | 'service' | 'docker' | 'system'

export interface Listener {
  port: number
  pid: number
  name: string
  command: string
  cwd?: string
  group: ListenerGroup
  project?: { name: string; path: string; framework?: string }
  docker?: string
  hostname?: string
}

interface RawListener {
  port: number
  pid: number
  command: string
}

const portOf = (address: string): number => Number(address.slice(address.lastIndexOf(':') + 1))

function claimPort(byPort: Map<number, RawListener>, next: RawListener, selfPid: number): void {
  const seen = byPort.get(next.port)
  if (next.port > 0 && (!seen || (seen.pid === selfPid && next.pid !== selfPid)))
    byPort.set(next.port, next)
}

/**
 * Pure: `lsof -Fpcn` → one entry per port. A port held by `selfPid` as well as another process
 * belongs to the other one: atlas's own loopback bridges sit on the service's port.
 */
export function parseLsof(out: string, selfPid: number): RawListener[] {
  const byPort = new Map<number, RawListener>()
  let pid = 0
  let command = ''
  for (const line of out.split('\n')) {
    const value = line.slice(1)
    if (line[0] === 'p') pid = Number(value)
    else if (line[0] === 'c') command = value
    else if (line[0] === 'n') claimPort(byPort, { port: portOf(value), pid, command }, selfPid)
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port)
}

/** Pure: the deepest catalogued project containing `cwd`. */
export function projectFor(cwd: string | undefined, projects: Project[]): Project | undefined {
  if (!cwd) return undefined
  let best: Project | undefined
  for (const p of projects) {
    const inside = cwd === p.path || cwd.startsWith(`${p.path}/`)
    if (inside && (!best || p.path.length > best.path.length)) best = p
  }
  return best
}

function displayName(command: string, cwd: string | undefined): string {
  const app = command.match(/\/([^/]+)\.app\//)?.[1]
  if (app) return app
  if (cwd && cwd !== '/') return basename(cwd)
  return basename(command.split(/\s+/)[0])
}

/** pid → cwd and pid → full argv, one `lsof` and one `ps` for all pids. */
async function processDetails(pids: number[]) {
  const cwds = new Map<number, string>()
  const commands = new Map<number, string>()
  if (!pids.length) return { cwds, commands }
  const list = pids.join(',')

  let pid = 0
  for (const line of (
    await stdoutOf('/usr/sbin/lsof', ['-a', '-d', 'cwd', '-p', list, '-Fpn'])
  ).split('\n')) {
    if (line[0] === 'p') pid = Number(line.slice(1))
    else if (line[0] === 'n' && pid) cwds.set(pid, line.slice(1))
  }
  for (const line of (await stdoutOf('/bin/ps', ['-ww', '-o', 'pid=,args=', '-p', list])).split(
    '\n',
  )) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/)
    if (m) commands.set(Number(m[1]), m[2].trim())
  }
  return { cwds, commands }
}

/** Published docker ports → container name. Empty when docker isn't running. */
async function dockerPorts(): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  const out = await stdoutOf('/opt/homebrew/bin/docker', [
    'ps',
    '--format',
    '{{.Names}}\t{{.Ports}}',
  ])
  for (const line of out.split('\n')) {
    const [container, ports = ''] = line.split('\t')
    for (const m of ports.matchAll(/:(\d+)->/g)) map.set(Number(m[1]), container)
  }
  return map
}

async function scanListeners(): Promise<Listener[]> {
  const raw = parseLsof(
    await stdoutOf('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpcn']),
    process.pid,
  )
  const [{ cwds, commands }, docker, atlas, hostnames] = await Promise.all([
    processDetails([...new Set(raw.map((r) => r.pid))]),
    dockerPorts(),
    scan(DEV_FOLDER, { skipGit: true }), // cached, stale-while-revalidate
    listHostnames(),
  ])
  const projects = atlas.projects.filter((p) => p.isLocal)
  const services = new Map(getServices().map((s) => [s.port, s]))

  return raw.map(({ port, pid, command: short }) => {
    const cwd = cwds.get(pid)
    const command = commands.get(pid) ?? short
    const service = services.get(port)
    const project = projectFor(cwd, projects)
    const container = docker.get(port)
    const base = { port, pid, command, cwd, name: displayName(command, cwd) }

    if (service) {
      const hostname = hostnames.find((h) => h.slug === service.slug)?.local
      return { ...base, group: 'service', name: service.name, hostname }
    }
    if (project) {
      const hostname = hostnames.find((h) => h.path === project.path)?.local
      const { name, path, framework } = project
      return { ...base, group: 'project', name, project: { name, path, framework }, hostname }
    }
    if (container) return { ...base, group: 'docker', name: container, docker: container }
    return { ...base, group: 'system' }
  })
}

// A full scan takes a few seconds with a few hundred listeners; the page polls every 15s.
const TTL_MS = 10_000
let cached: { at: number; listeners: Promise<Listener[]> } | null = null

export function getListeners(fresh = false): Promise<Listener[]> {
  if (fresh || !cached || Date.now() - cached.at > TTL_MS) {
    cached = { at: Date.now(), listeners: scanListeners() }
    cached.listeners.catch(() => {
      cached = null
    })
  }
  return cached.listeners
}

/**
 * SIGKILL each pid — but only pids the last scan saw listening, never atlas-api itself. The
 * route is not a general-purpose `kill`.
 */
export async function killListeners(pids: number[]): Promise<{ pid: number; killed: boolean }[]> {
  const listening = new Set((await getListeners()).map((l) => l.pid))
  const results = pids.map((pid) => {
    if (!listening.has(pid) || pid <= 1 || pid === process.pid) return { pid, killed: false }
    try {
      process.kill(pid, 'SIGKILL')
      return { pid, killed: true }
    } catch {
      return { pid, killed: false } // already gone
    }
  })
  cached = null
  return results
}
