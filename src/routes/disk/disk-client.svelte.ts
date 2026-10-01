/** The /disk page's client side: CLI reads, the running job, and number formatting. */
import { invalidateAll } from '$app/navigation'
import type { DiskResult, JobState } from '$lib/disk'
import { errorMessage } from '$lib/format'
import { HttpError, http } from '$lib/http'
import { toast } from '$lib/toast.svelte'

/** A side-effect-free `atlas disk … --json`; the CLI's own `exit: 'error'` throws too. */
export async function readDisk(cmd: string, ...args: string[]): Promise<DiskResult> {
  const q = new URLSearchParams({ cmd })
  for (const a of args) q.append('arg', a)
  const body = await http.get<DiskResult>(`/api/disk/read?${q}`)
  if (body.exit === 'error') throw new Error(body.error ?? body.message ?? 'error')
  return body
}

/** The one job the panel follows; runJob starts no second one while it runs. */
export const job = $state<{
  current: JobState | null
  text: string
  offset: number
  finished: number
}>({
  current: null,
  text: '',
  offset: 0,
  /** Counts finished jobs; sections that fetch their own data re-read when it moves. */
  finished: 0,
})

/** True once the job started; a caller clears its inputs only then. */
export async function runJob(command: string, args: string[]): Promise<boolean> {
  // Following a second job would hide the running one, its log and its Cancel button.
  if (job.current && !job.current.done) {
    toast(`atlas disk ${job.current.args[0]} is still running`, 'error')
    return false
  }
  try {
    const meta = await http.post<JobState>('/api/disk/jobs', { command, args })
    follow({ ...meta, done: false, exit: null })
    return true
  } catch (e) {
    toast(`atlas disk ${command} did not start: ${errorMessage(e)}`, 'error')
    return false
  }
}

export function follow(state: JobState): void {
  job.current = state
  job.text = ''
  job.offset = 0
}

/** One poll; true while the job still runs. The page reloads its data when it ends. */
export async function poll(): Promise<boolean> {
  const id = job.current?.id
  if (!id) return false
  let s: JobState & { text: string; offset: number }
  try {
    s = await http.get(`/api/disk/jobs/${id}?offset=${job.offset}`)
  } catch (e) {
    // A 5xx (the NAS proxy mid-reload, a daemon restart) is passing; only a 4xx ends the watch.
    if (!(e instanceof HttpError)) throw e
    if (e.status >= 500) return true
    // The job is gone: end it here too, or runJob would refuse every new job until a reload.
    if (job.current?.id === id) job.current = { ...job.current, done: true }
    return false
  }
  if (job.current?.id !== id) return false // another job was followed meanwhile
  job.text += s.text
  job.offset = s.offset
  job.current = s
  if (s.done) {
    job.finished++
    await invalidateAll()
  }
  return !s.done
}

export const cancelJob = () =>
  job.current &&
  http
    .delete(`/api/disk/jobs/${job.current.id}`)
    .catch((e) => toast(`Cancel failed: ${errorMessage(e)}`, 'error'))

export const EXIT_NAMES: Record<number, string> = {
  0: 'ok',
  1: 'error',
  2: 'nothing to do',
  3: 'partly failed',
  4: 'refused',
  130: 'cancelled',
}

export function human(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = bytes
  let i = 0
  while (Math.abs(n) >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i && Math.abs(n) < 10 ? 1 : 0)} ${units[i]}`
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${mins}m ago`
  if (mins < 48 * 60) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 1440)}d ago`
}
