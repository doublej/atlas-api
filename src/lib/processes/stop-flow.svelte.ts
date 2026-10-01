/**
 * The stop dialog of /processes and /ports: a dry run lists every process that will end
 * (children included), one ConfirmDialog asks, and the real stop ends exactly those, each one
 * re-checked by the server. Render one ConfirmDialog from `asking`.
 */
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import { toast } from '$lib/toast.svelte'
import { refusalLine, stopSummary } from './display'
import type { StopResponse, StopTarget } from './types'

export interface Asking {
  title: string
  message: string
  items: string[]
  confirmLabel: string
  run: () => Promise<unknown>
}

const STOP = '/api/processes/stop'

export class StopFlow {
  /** The dialog on screen, if any. Also used for other confirms on the page (restart). */
  asking = $state<Asking | null>(null)
  readonly #after: () => unknown

  /** `after` runs once a stop finished, to reread the list. */
  constructor(after: () => unknown) {
    this.#after = after
  }

  /** `names` labels a refused target, which the server reports by pid only. */
  async ask(
    targets: StopTarget[],
    opts: { tree?: boolean; force?: boolean } = {},
    names: Map<number, string> = new Map(),
  ): Promise<void> {
    if (!targets.length) return
    let plan: StopResponse
    try {
      plan = await http.post<StopResponse>(STOP, { targets, ...opts, dryRun: true })
    } catch (e) {
      toast(`Stop failed: ${errorMessage(e)}`, 'error')
      return
    }
    const refused = [
      ...plan.results.flatMap((r) =>
        r.refusal ? [refusalLine(names.get(r.pid) ?? 'process', r.pid, r.refusal, r.label)] : [],
      ),
      ...plan.skipped.map((s) => refusalLine(s.name, s.pid, s.refusal, s.label)),
    ]
    if (!plan.wouldEnd.length) {
      toast(refused.length ? `Not stopped: ${refused.join('; ')}` : 'Already gone', 'error')
      await this.#after()
      return
    }
    const n = plan.wouldEnd.length
    const verb = opts.force ? 'Force stop' : 'Stop'
    this.asking = {
      title: `${verb} ${n} process${n === 1 ? '' : 'es'}?`,
      message: opts.force
        ? 'SIGTERM now; whatever still runs 5 seconds later gets SIGKILL.'
        : 'SIGTERM. Whatever still runs 5 seconds later is reported, not killed.',
      items: [
        ...plan.wouldEnd.map((p) => `${p.name} · pid ${p.pid} · ${p.command || p.kind}`),
        ...refused.map((r) => `not stopped: ${r}`),
      ],
      confirmLabel: verb,
      // Exactly what the dialog listed, each re-checked (pid + start time) by the server.
      run: () => this.#run(plan.wouldEnd, Boolean(opts.force)),
    }
  }

  async #run(ending: StopTarget[], force: boolean): Promise<void> {
    const targets = ending.map(({ pid, startedAt }) => ({ pid, startedAt }))
    const { text, tone } = stopSummary(await http.post<StopResponse>(STOP, { targets, force }))
    toast(text, tone)
    await this.#after()
  }
}
