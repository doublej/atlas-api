import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import type { AppRow, ProcessInfo, ProcessSnapshot, StopTarget } from '$lib/processes/types'

const POLL_MS = 5000

/** One project's live processes on this Mac, polled while the page is open. */
export class ProjectProcesses {
  rows = $state<AppRow[]>([])
  procs = $state<Map<number, ProcessInfo>>(new Map())
  error = $state<string | null>(null)
  loaded = $state(false)
  /** A dev server atlas started, or anything of the project's listening on a port. */
  running = $derived(this.rows.some((r) => r.atlasRun || r.ports.length > 0))
  readonly #path: string

  constructor(path: string) {
    this.#path = path
  }

  load = async (fresh = false): Promise<void> => {
    try {
      const q = `project=${encodeURIComponent(this.#path)}${fresh ? '&fresh=1' : ''}`
      const snap = await http.get<ProcessSnapshot>(`/api/processes?${q}`)
      this.rows = snap.rows
      this.procs = new Map(snap.processes.map((p) => [p.pid, p]))
      this.error = null
    } catch (e) {
      this.error = errorMessage(e)
    }
    this.loaded = true
  }

  /** Starts polling; returns the stop function for an `$effect`. */
  poll(): () => void {
    this.load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') this.load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }

  /** Every live member of the rows: stopping a row ends its whole process group. */
  targets(rows: AppRow[]): StopTarget[] {
    return rows.flatMap((r) =>
      r.pids.flatMap((pid) => {
        const p = this.procs.get(pid)
        return p && !p.zombie ? [{ pid, startedAt: p.startedAt }] : []
      }),
    )
  }
}
