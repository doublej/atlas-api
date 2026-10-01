/** The /disk page's client side: CLI reads, the running job, and number formatting. */
import { invalidateAll } from '$app/navigation'
import type { DiskResult, JobState } from '$lib/disk'
import { errorMessage } from '$lib/format'
import { HttpError, http } from '$lib/http'

/** A side-effect-free `atlas disk … --json`; the CLI's own `exit: 'error'` throws too. */
export async function readDisk(cmd: string, ...args: string[]): Promise<DiskResult> {
  const q = new URLSearchParams({ cmd })
  for (const a of args) q.append('arg', a)
  const body = await http.get<DiskResult>(`/api/disk/read?${q}`)
  if (body.exit === 'error') throw new Error(body.error ?? body.message ?? 'error')
  return body
}

/** The one job the panel follows. The CLI's lock refuses a second one (exit 4), which the panel shows. */
export const job = $state<{
  current: JobState | null
  text: string
  offset: number
  error: string
  finished: number
}>({
  current: null,
  text: '',
  offset: 0,
  error: '',
  /** Counts finished jobs; sections that fetch their own data re-read when it moves. */
  finished: 0,
})

export async function runJob(command: string, args: string[]): Promise<void> {
  job.error = ''
  try {
    const meta = await http.post<JobState>('/api/disk/jobs', { command, args })
    follow({ ...meta, done: false, exit: null })
  } catch (e) {
    job.error = errorMessage(e)
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
    if (e instanceof HttpError) return e.status >= 500
    throw e
  }
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
  http.delete(`/api/disk/jobs/${job.current.id}`).catch((e) => (job.error = errorMessage(e)))

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

/** The /ports selection model: click toggles, shift extends from the last click, a group sets many. */
export class Selection {
  keys = $state(new Set<string>())
  #anchor: string | null = null

  has = (k: string) => this.keys.has(k)
  get size() {
    return this.keys.size
  }
  get list() {
    return [...this.keys]
  }

  setMany(ks: string[], on: boolean) {
    const next = new Set(this.keys)
    for (const k of ks) on ? next.add(k) : next.delete(k)
    this.keys = next
  }

  /** `ordered` is the visible rows in render order, for a shift-range. */
  click(k: string, e: MouseEvent, ordered: string[]) {
    if (e.shiftKey && this.#anchor !== null) {
      const [a, b] = [ordered.indexOf(this.#anchor), ordered.indexOf(k)].sort((x, y) => x - y)
      if (a !== -1) this.setMany(ordered.slice(a, b + 1), true)
    } else this.setMany([k], !this.keys.has(k))
    this.#anchor = k
  }

  /** Drop keys that are no longer rows (after a job changed the data). */
  keep(ks: string[]) {
    const live = new Set(ks)
    if ([...this.keys].some((k) => !live.has(k)))
      this.keys = new Set([...this.keys].filter((k) => live.has(k)))
  }
}
