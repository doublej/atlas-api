/**
 * One snapshot of this Mac's processes, behind /processes, /ports, /api/ports/listeners and
 * `atlas ps`. One `ps`, netstat, `launchctl list` and sysctl in parallel, then one batched lsof
 * (cwd + stdout) over the development candidates. Cached ~2s with one shared in-flight build and
 * no timer: it runs only while someone asks, and so does the sparkline history it feeds.
 */
import { type ExecFileException, execFile, spawn } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { homedir, loadavg } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { listHostnames } from '../caddyDev'
import { DEV_FOLDER } from '../config'
import { listSockets, type Socket } from '../ports'
import { type Project, scan } from '../scanner'
import { topBy } from './flags'
import { buildRows, classifyRows, type Proc } from './groups'
import {
  type OpenFiles,
  PS_COLUMNS,
  type PsRow,
  parseLaunchctl,
  parseLsof,
  parsePs,
  parseSysctl,
  SYSCTL_NAMES,
} from './parse'
import type { AppRow, ProcessInfo, ProcessSnapshot } from './types'
import { record } from './view'

const TTL_MS = 2_000
const TIMEOUT_MS = 5_000
/** A paused or Resource-Saver Docker Desktop must not hold every process view for 5s. */
const DOCKER_TIMEOUT_MS = 1_500
/** ps prints `%cpu` and `lstart` with a decimal comma and Dutch day names under nl_NL. */
const ENV = { LC_ALL: 'C', HOME: homedir() }
export const LOG_DIR = join(DEV_FOLDER, '.atlas-logs')
/** Docker Desktop, the default context and colima. `docker ps` only runs when one exists. */
const DOCKER_SOCKETS = [
  '/var/run/docker.sock',
  join(homedir(), '.docker/run/docker.sock'),
  join(homedir(), '.colima/default/docker.sock'),
]
/** Homebrew's CLI, else Docker Desktop's. */
const DOCKER_BINS = ['/opt/homebrew/bin/docker', '/usr/local/bin/docker']

export interface Snapshot {
  generatedAt: string
  self: { pid: number; pgid: number }
  system: ProcessSnapshot['system']
  rows: AppRow[]
  processes: ProcessInfo[]
  byPid: Map<number, ProcessInfo>
  sockets: Socket[]
  /** Published docker port → container name. */
  docker: Map<number, string>
  projects: Project[]
  hostnames: Awaited<ReturnType<typeof listHostnames>>
}

/** A command killed for running past `TIMEOUT_MS`, named with the load that explains it. */
const timedOut = (cmd: string, error: ExecFileException) =>
  error.killed
    ? new Error(`${cmd} took over ${TIMEOUT_MS / 1000}s (load ${loadavg()[0].toFixed(0)})`)
    : null

/**
 * A command's stdout. `tolerant` keeps it on a plain non-zero exit (lsof and ps exit 1 when one
 * pid is gone, yet print the rest); a failure to run, a timeout or (without `tolerant`) any exit
 * code throws, so it never reads as "nothing is running".
 */
function read(cmd: string, args: string[], tolerant = false, encoding: 'utf8' | 'latin1' = 'utf8') {
  return new Promise<string>((resolve, reject) => {
    const opts = { env: ENV, encoding, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 }
    execFile(cmd, args, opts, (error, stdout) => {
      const exited = error && typeof error.code === 'number' && !error.killed
      if (error && !(tolerant && exited)) reject(timedOut(cmd, error) ?? error)
      else resolve(String(stdout))
    })
  })
}

/**
 * Enrichment the snapshot can do without (lsof's cwd, docker's container names): a missing
 * binary, a timeout or a signal reads as nothing found, keeping whatever stdout came first.
 */
function optional(cmd: string, args: string[], timeout = TIMEOUT_MS) {
  return new Promise<string>((resolve) => {
    const opts = { env: ENV, timeout, maxBuffer: 64 * 1024 * 1024 }
    execFile(cmd, args, opts, (_error, stdout) => resolve(String(stdout ?? '')))
  })
}

/** Every process on this Mac, parsed. Latin1 so the fixed 16-byte ucomm column slices exactly. */
export async function readPs(pids?: number[]): Promise<PsRow[]> {
  const scope = pids ? ['-p', pids.join(',')] : ['-ax']
  return parsePs(
    await read('/bin/ps', [...scope, '-ww', '-o', PS_COLUMNS], Boolean(pids), 'latin1'),
  )
}

/** pid → launchd label, for every running job (`application.*` GUI apps included). */
export const readLaunchd = async () => parseLaunchctl(await read('/bin/launchctl', ['list'], true))

const SESSION = /(?:^|\s)CLD_SESSION_NAME=([A-Za-z0-9_.-]{1,64})(?=\s|$)/g
/** `pid@startedAt` → its agent session name (or none). A process's initial environment never changes. */
const sessionCache = new Map<string, string | null>()

/**
 * `ps -E` appends each process's initial environment to its command. Only the session token
 * survives: each line is dropped once the regex ran, stderr is ignored, nothing is logged.
 * `complete` is false when ps was killed or never ran: a pid it did not print may have a name.
 */
function psSessions(pids: number[]): Promise<{ names: Map<number, string>; complete: boolean }> {
  const names = new Map<number, string>()
  const ps = spawn('/bin/ps', ['-Eww', '-o', 'pid=,command=', '-p', pids.join(',')], {
    env: ENV,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const timer = setTimeout(() => ps.kill('SIGKILL'), TIMEOUT_MS)
  createInterface({ input: ps.stdout }).on('line', (line) => {
    let name: string | undefined
    for (const m of line.matchAll(SESSION)) name = m[1] // the environment follows the args
    if (name) names.set(Number.parseInt(line, 10), name)
  })
  return new Promise((resolve) => {
    ps.on('error', () => resolve({ names, complete: false }))
    ps.on('close', (_code, signal) => {
      clearTimeout(timer)
      resolve({ names, complete: !signal })
    })
  })
}

const sessionKey = (p: Proc) => `${p.pid}@${p.startedAt}`
let sessionRead: Promise<void> | null = null

/** Reads the session names of processes not seen before into the cache, one read at a time. */
function learnSessions(procs: Proc[]): Promise<void> {
  const fresh = procs.filter((p) => !sessionCache.has(sessionKey(p)))
  if (sessionRead || !fresh.length) return sessionRead ?? Promise.resolve()
  sessionRead = psSessions(fresh.map((p) => p.pid))
    .then(({ names, complete }) => {
      for (const p of fresh) {
        const name = names.get(p.pid)
        // Only a finished read may say "no session"; the rest is asked again next snapshot.
        if (name || complete) sessionCache.set(sessionKey(p), name ?? null)
      }
    })
    .finally(() => {
      sessionRead = null
    })
  return sessionRead
}

/**
 * Session names for `procs`. `ps -E` walks every process again (~80–100ms) and on a busy Mac
 * there is always a new pid, so after the first snapshot it runs off the critical path: a
 * process born since shows its session one snapshot later.
 */
async function readSessions(procs: Proc[]): Promise<Map<number, string>> {
  const reading = learnSessions(procs)
  if (!sessionCache.size) await reading
  const live = new Set(procs.map(sessionKey))
  for (const k of sessionCache.keys()) if (!live.has(k)) sessionCache.delete(k)
  const names = new Map<number, string>()
  for (const p of procs) {
    const name = sessionCache.get(sessionKey(p))
    if (name) names.set(p.pid, name)
  }
  return names
}

/** Published docker ports → container name; empty, without spawning docker, when none runs. */
async function readDocker(): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  const running = DOCKER_SOCKETS.some((s) => existsSync(s) && statSync(s).isSocket())
  const bin = DOCKER_BINS.find((b) => existsSync(b))
  if (!running || !bin) return map
  const out = await optional(bin, ['ps', '--format', '{{.Names}}\t{{.Ports}}'], DOCKER_TIMEOUT_MS)
  for (const line of out.split('\n')) {
    const [container, ports = ''] = line.split('\t')
    for (const m of ports.matchAll(/:(\d+)->/g)) map.set(Number(m[1]), container)
  }
  return map
}

const LSOF_ARGS = ['-b', '-w', '-a', '-d', 'cwd,1', '-Fpfn', '-p']
/** `pid@startedAt` → its cwd and stdout, as lsof saw them when the process was first met. */
const fileCache = new Map<string, OpenFiles>()

/**
 * cwd and fd 1 of the candidates. lsof runs only for processes not seen before, so a poll costs
 * one ps instead of ps + lsof; one whose read failed is asked again next snapshot. ponytail: a
 * shell that `cd`s later keeps its first cwd until it exits — attribution, not a live pwd;
 * re-read per poll if that ever matters.
 */
async function readFiles(procs: Proc[]): Promise<Map<number, OpenFiles>> {
  const fresh = procs.filter((p) => !fileCache.has(sessionKey(p)))
  if (fresh.length) {
    const pids = fresh.map((p) => p.pid).join(',')
    // A timed-out or failed lsof caches nothing.
    const found = await read('/usr/sbin/lsof', [...LSOF_ARGS, pids], true).then(
      parseLsof,
      () => null,
    )
    if (found) for (const p of fresh) fileCache.set(sessionKey(p), found.get(p.pid) ?? {})
  }
  const live = new Set(procs.map(sessionKey))
  for (const k of fileCache.keys()) if (!live.has(k)) fileCache.delete(k)
  return new Map(procs.map((p) => [p.pid, fileCache.get(sessionKey(p)) ?? {}]))
}

// ponytail: grows with every distinct home directory seen in argv; cleared wholesale at the cap.
const realDirs = new Map<string, string>()
function realDir(dir: string): string {
  if (realDirs.size > 5_000) realDirs.clear()
  let real = realDirs.get(dir)
  if (real === undefined) {
    real = existsSync(dir) ? realpathSync(dir) : dir
    realDirs.set(dir, real)
  }
  return real
}

function portsByPid(sockets: Socket[]): Map<number, number[]> {
  const ports = new Map<number, number[]>()
  for (const { pid, port } of sockets) {
    const list = ports.get(pid) ?? []
    if (!list.includes(port))
      ports.set(
        pid,
        [...list, port].sort((a, b) => a - b),
      )
  }
  return ports
}

async function build(): Promise<Snapshot> {
  const uid = process.getuid?.() ?? 0
  const [ps, sockets, launchd, sysctl, atlas, hostnames] = await Promise.all([
    readPs(),
    listSockets(),
    readLaunchd(),
    read('/usr/sbin/sysctl', ['-n', ...SYSCTL_NAMES], true),
    // Paths only: a poll every few seconds must not start a full ~/dev rescan each minute.
    scan(DEV_FOLDER, { skipGit: true, revalidate: false }),
    listHostnames(),
  ])
  const procs = classifyRows(ps, uid)
  const listening = new Set(sockets.map((s) => s.pid))
  const candidates = procs.filter(
    (p) =>
      listening.has(p.pid) ||
      (p.uid === uid && !p.zombie && p.role !== 'app' && p.role !== 'system'),
  )
  const [files, sessions, docker] = await Promise.all([
    readFiles(candidates),
    readSessions(candidates),
    readDocker(),
  ])
  const projects = atlas.projects.filter((p) => p.isLocal)
  const { processes, rows } = buildRows(procs, {
    now: Date.now(),
    files,
    ports: portsByPid(sockets),
    launchd,
    sessions,
    projects,
    realDir,
    exists: existsSync,
    logDir: LOG_DIR,
    hostnames: new Map(hostnames.flatMap((h) => (h.path ? [[h.path, h.local]] : []))),
  })
  const self = {
    pid: process.pid,
    pgid: ps.find((p) => p.pid === process.pid)?.pgid ?? process.pid,
  }
  const system = {
    ...parseSysctl(sysctl),
    loadAvg: loadavg() as [number, number, number],
    topByRss: topBy(rows, 'rss'),
    topByCpu: topBy(rows, 'cpu'),
  }
  const byPid = new Map(processes.map((p) => [p.pid, p]))
  const generatedAt = new Date().toISOString()
  return { generatedAt, self, system, rows, processes, byPid, sockets, docker, projects, hostnames }
}

let current: { at: number; snap: Snapshot } | null = null
let inflight: Promise<Snapshot> | null = null

/** The snapshot, at most ~2s old; `fresh` skips the cache but still joins a build in flight. */
export function getSnapshot(fresh = false): Promise<Snapshot> {
  if (!fresh && current && Date.now() - current.at < TTL_MS) return Promise.resolve(current.snap)
  if (inflight) return inflight
  const pending: Promise<Snapshot> = build()
    .then((snap) => {
      // A build invalidateSnapshot() dropped saw processes that have since ended: never cache it.
      if (inflight === pending) {
        current = { at: Date.now(), snap }
        record(snap.rows)
      }
      return snap
    })
    .finally(() => {
      if (inflight === pending) inflight = null
    })
  inflight = pending
  return pending
}

/** After a stop: the next read must not show what just ended, nor join a build that began before it. */
export function invalidateSnapshot(): void {
  current = null
  inflight = null
}
