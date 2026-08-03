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

export async function printLabel(label: string, scheduled = false): Promise<LaunchctlState> {
  const { stdout, code } = await runLaunchctl(['print', `gui/${UID}/${label}`])
  if (code !== 0) return { pid: null, lastExitStatus: null, status: 'stopped' }
  const pidMatch = stdout.match(/^\s*pid\s*=\s*(\d+)/m)
  const exitMatch = stdout.match(/^\s*last exit code\s*=\s*(-?\d+)/m)
  const pid = pidMatch ? Number(pidMatch[1]) : null
  const lastExitStatus = exitMatch ? Number(exitMatch[1]) : null
  let status: LaunchctlStatus
  if (pid) status = 'running'
  else if (lastExitStatus !== null && lastExitStatus !== 0) status = 'error'
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
