import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

export type LaunchctlStatus = 'running' | 'idle' | 'error' | 'stopped'

export interface LaunchctlState {
  pid: number | null
  lastExitStatus: number | null
  status: LaunchctlStatus
}

const UID = process.getuid?.() ?? 501
const TIMEOUT_MS = 5000

interface RunResult {
  stdout: string
  code: number
}

function runLaunchctl(args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn('launchctl', args)
    let stdout = ''
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk) => (stdout += chunk.toString()))
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, code: code ?? -1 })
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve({ stdout, code: -1 })
    })
  })
}

// A daemon with any of these plist keys runs on a trigger and exits between
// runs — no pid means "idle", not "stopped".
const SCHEDULE_KEYS =
  /<key>(StartInterval|StartCalendarInterval|WatchPaths|QueueDirectories|LaunchEvents|Sockets)<\/key>/

export async function isScheduledPlist(plistPath?: string): Promise<boolean> {
  if (!plistPath) return false
  try {
    return SCHEDULE_KEYS.test(await readFile(plistPath, 'utf8'))
  } catch {
    return false
  }
}

/** Pure: `launchctl list` (`PID\tStatus\tLabel`) → label → [pid, last exit]. A `-` pid is "not running". */
export function parseLaunchctlList(out: string): Map<string, [number | null, number]> {
  const jobs = new Map<string, [number | null, number]>()
  for (const line of out.split('\n').slice(1)) {
    const [pid, status, label] = line.split('\t')
    if (label) jobs.set(label, [pid === '-' ? null : Number(pid), Number(status)])
  }
  return jobs
}

/**
 * Every loaded job of this user in one `launchctl list` (~10ms), instead of a `launchctl print`
 * per label. Throws when launchctl itself fails, so a failed read never reads as "all stopped".
 */
export async function listJobs(): Promise<Map<string, [number | null, number]>> {
  const { stdout, code } = await runLaunchctl(['list'])
  if (code !== 0) throw new Error(`launchctl list exited ${code}`)
  return parseLaunchctlList(stdout)
}

/**
 * One job's state from `listJobs()`. A label that is not loaded is stopped. `launchctl list`
 * prints 0 both for "exited cleanly" and "never exited", so only a failing exit is reported.
 */
export function jobState(
  jobs: Map<string, [number | null, number]>,
  label: string,
  scheduled = false,
): LaunchctlState {
  const job = jobs.get(label)
  if (!job) return { pid: null, lastExitStatus: null, status: 'stopped' }
  const [pid, exit] = job
  const lastExitStatus = exit === 0 ? null : exit
  let status: LaunchctlStatus
  if (pid) status = 'running'
  else if (lastExitStatus !== null) status = 'error'
  else if (scheduled) status = 'idle'
  else status = 'stopped'
  return { pid, lastExitStatus, status }
}

export function kickstart(label: string): Promise<RunResult> {
  return runLaunchctl(['kickstart', '-k', `gui/${UID}/${label}`])
}

export function bootout(label: string): Promise<RunResult> {
  return runLaunchctl(['bootout', `gui/${UID}/${label}`])
}

export function bootstrap(plistPath: string): Promise<RunResult> {
  return runLaunchctl(['bootstrap', `gui/${UID}`, plistPath])
}
