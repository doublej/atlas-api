import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { getHostById, getRemoteHosts, type HostDef } from '$shared/hosts'
import { DEV_FOLDER } from './config'
import { errorMessage } from './format'
import { type HostFragment, hostFragmentPath, type Project, writeJsonAtomic } from './scanner'

const execFileAsync = promisify(execFile)

/**
 * Where `bun run agent:build` writes the bundle that gets shipped to the remote hosts.
 * Derived from the catalog root rather than from `import.meta.url`, which points inside
 * `build/` once adapter-node has bundled this module. `ATLAS_AGENT_BUNDLE` overrides it.
 */
const AGENT_BUNDLE =
  process.env.ATLAS_AGENT_BUNDLE ??
  join(DEV_FOLDER, 'multi-stack', 'project-atlas', 'shared', 'agent', 'atlas-scan.mjs')

/** Remote fragments age far slower than the local cache: an SSH round trip is ~0.6-0.9s and
 *  Windows OpenSSH has no `ControlMaster`, so there is no cheap repeat scan to lean on. */
const FRAGMENT_TTL = 10 * 60 * 1000

/** A powered-off DHCP box otherwise hangs the TCP connect for ~75s. */
const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=4']
const SCAN_TIMEOUT = 180_000
const MAX_BUFFER = 128 * 1024 * 1024

/** In-flight scans, keyed by host id — a second caller joins the first rather than opening a
 *  second SSH session. Not keyed globally: two different hosts scan concurrently. */
const inFlight = new Map<string, Promise<HostFragment>>()

async function fragmentAge(hostId: string): Promise<number> {
  try {
    const { mtimeMs } = await stat(hostFragmentPath(DEV_FOLDER, hostId))
    return Date.now() - mtimeMs
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/**
 * Ship the scan agent to `host`. scp cannot create the destination directory, and Windows
 * paths containing spaces are unquotable through scp — hence the explicit mkdir and the
 * forward-slash, space-free `agent` paths in `hosts.json`.
 */
export async function syncAgent(host: HostDef): Promise<void> {
  if (!host.ssh || !host.agent) throw new Error(`host ${host.id} has no ssh/agent configured`)
  const dir = dirname(host.agent)
  const mkdir =
    host.os === 'win32' ? `New-Item -ItemType Directory -Force -Path ${dir}` : `mkdir -p ${dir}`
  await execFileAsync('ssh', [...SSH_OPTS, host.ssh, mkdir], { timeout: 30_000 })
  await execFileAsync('scp', ['-q', AGENT_BUNDLE, `${host.ssh}:${host.agent}`], { timeout: 60_000 })
}

/**
 * Run the scan agent on `host` and return its projects.
 *
 * Everything about the command line is load-bearing on Fractal, whose SSH shell is PowerShell:
 * one double-quoted argument, forward slashes (Node accepts them on Windows), no `&` (not a
 * separator in PowerShell — it errors with AmpersandNotAllowed), no `$`, no spaces in paths.
 * stdout is pure JSON; the post-quantum SSH banner and any `rg`-missing warning go to stderr.
 */
async function runRemoteScan(host: HostDef): Promise<Project[]> {
  const node = host.node ?? 'node'
  const flags = host.skipGit ? ' --skip-git' : ''
  const command = `${node} ${host.agent} ${host.root} --json${flags}`

  const attempt = () =>
    execFileAsync('ssh', [...SSH_OPTS, host.ssh as string, command], {
      timeout: SCAN_TIMEOUT,
      maxBuffer: MAX_BUFFER,
    })

  let stdout: string
  try {
    ;({ stdout } = await attempt())
  } catch (error) {
    // First run on a fresh host, or after the bundle moved: push it once and retry.
    const message = errorMessage(error)
    if (!/Cannot find module|ENOENT|cannot be loaded|is not recognized/i.test(message)) throw error
    await syncAgent(host)
    ;({ stdout } = await attempt())
  }

  // Slice from the first `{`: defensive against a shell banner reaching stdout. CRLF is
  // fine either way — JSON.parse treats `\r` as inter-token whitespace.
  const start = stdout.indexOf('{')
  if (start === -1) throw new Error(`no JSON on stdout from ${host.id}`)
  const atlas = JSON.parse(stdout.slice(start).trim()) as { projects: Project[] }
  return atlas.projects
}

/**
 * Scan one remote host and persist its fragment. Never throws: an unreachable host keeps its
 * previous projects and is reported as `unreachable`, so the catalog degrades to
 * "ubuntu down, scanned 3h ago" instead of silently losing 26 projects.
 */
export async function scanHost(host: HostDef): Promise<HostFragment> {
  const path = hostFragmentPath(DEV_FOLDER, host.id)
  let fragment: HostFragment

  try {
    const projects = await runRemoteScan(host)
    // Re-stamped here, not trusted from the wire: a stale agent bundle on the far side
    // stamps whatever *its* hosts.json said was primary.
    for (const p of projects) {
      p.host = host.id
      delete p.isLocal
    }
    fragment = {
      hostId: host.id,
      root: host.root,
      scannedAt: new Date().toISOString(),
      status: 'ok',
      projects,
    }
  } catch (error) {
    const message = errorMessage(error)
    const previous = await readFragment(path)
    fragment = {
      hostId: host.id,
      root: host.root,
      scannedAt: previous?.scannedAt ?? new Date().toISOString(),
      status: 'unreachable',
      error: message.split('\n')[0].slice(0, 200),
      projects: previous?.projects ?? [],
    }
  }

  await writeJsonAtomic(path, fragment)
  return fragment
}

async function readFragment(path: string): Promise<HostFragment | null> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Refresh remote hosts in the background. Deliberately not awaited by any request handler —
 * `/api/projects` must answer from the merged cache in milliseconds whether or not Ubuntu is
 * powered on. Hosts whose fragment is still within the TTL are skipped unless `force`.
 */
export async function refreshHosts(
  options: { hostId?: string; force?: boolean } = {},
): Promise<HostFragment[]> {
  const { hostId, force = false } = options
  const targets = hostId
    ? [getHostById(hostId)].filter((h): h is HostDef => Boolean(h?.ssh))
    : getRemoteHosts()

  const results = await Promise.all(
    targets.map(async (host) => {
      if (!force && (await fragmentAge(host.id)) < FRAGMENT_TTL) return null
      const running = inFlight.get(host.id)
      if (running) return running
      const promise = scanHost(host).finally(() => inFlight.delete(host.id))
      inFlight.set(host.id, promise)
      return promise
    }),
  )
  return results.filter((f): f is HostFragment => f !== null)
}
