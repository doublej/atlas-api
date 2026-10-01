/**
 * `POST /api/processes/stop`: the one way anything in atlas ends a process, for every caller.
 * Never trusts a cached snapshot: a fresh ps re-checks every target's identity (pid + start
 * time) and the refusals below. SIGTERM, wait up to 5s; SIGKILL only on `force`, only after
 * those 5s and only after the identity is checked once more.
 */
import { classify } from './classify'
import { type PsRow, redact } from './parse'
import { invalidateSnapshot, readLaunchd, readPs } from './snapshot'
import type {
  EndingProcess,
  StopRefusal,
  StopRequest,
  StopResponse,
  StopResult,
  StopTarget,
} from './types'

const GRACE_MS = 5_000
const KILL_WAIT_MS = 1_000
const POLL_MS = 200

export interface Self {
  pid: number
  pgid: number
  uid: number
}

type Refused = { refusal: StopRefusal; label?: string }

/** Pure: why `row` must not be signalled, or null. */
export function refusalOf(row: PsRow, self: Self, jobs: Map<number, string>): Refused | null {
  if (row.pid <= 1) return { refusal: 'protected-pid' }
  if (row.uid !== self.uid) return { refusal: 'other-user' }
  if (row.pid === self.pid || row.pgid === self.pgid) return { refusal: 'atlas-api' }
  // launchd would restart it, or it is a GUI app: `atlas daemons restart <label>` instead.
  const label = jobs.get(row.pid) ?? jobs.get(row.pgid)
  if (label) return { refusal: 'launchd-job', label }
  if (row.zombie) return { refusal: 'zombie' }
  return null
}

const toEnding = (r: PsRow, uid: number): EndingProcess => {
  const { kind, name } = classify(r, uid)
  const command = r.argsUnavailable ? '' : redact(r.args)
  return { pid: r.pid, ppid: r.ppid, pgid: r.pgid, startedAt: r.startedAt, kind, name, command }
}

export type Plan = Pick<StopResponse, 'results' | 'wouldEnd' | 'skipped'>

/**
 * Pure: every target (and with `tree` every descendant) checked against a fresh ps. Results are
 * `would-stop`, `gone` or `refused`; `wouldEnd` is in signal order, each parent before its children.
 */
export function planStop(
  rows: PsRow[],
  jobs: Map<number, string>,
  req: StopRequest,
  self: Self,
): Plan {
  const byPid = new Map(rows.map((r) => [r.pid, r]))
  const children = new Map<number, PsRow[]>()
  for (const r of rows) children.set(r.ppid, [...(children.get(r.ppid) ?? []), r])
  const ending = new Map<number, EndingProcess>()
  const skipped: Plan['skipped'] = []

  /** Descendants that pass on their own; a refused one is skipped with its subtree. */
  const pullTree = (pid: number): number[] => {
    const pulled: number[] = []
    const queue = [...(children.get(pid) ?? [])]
    for (let r = queue.shift(); r; r = queue.shift()) {
      const no = refusalOf(r, self, jobs)
      if (no) skipped.push({ pid: r.pid, name: classify(r, self.uid).name, ...no })
      else if (!ending.has(r.pid)) {
        ending.set(r.pid, toEnding(r, self.uid))
        pulled.push(r.pid)
        queue.push(...(children.get(r.pid) ?? []))
      }
    }
    return pulled
  }

  const resolve = ({ pid, startedAt }: StopTarget): StopResult => {
    const refused = (no: Refused): StopResult => ({ pid, startedAt, status: 'refused', ...no })
    if (pid <= 1) return refused({ refusal: 'protected-pid' })
    const row = byPid.get(pid)
    if (!row) return { pid, startedAt, status: 'gone' }
    if (row.startedAt !== startedAt) return refused({ refusal: 'pid-reused' })
    const no = refusalOf(row, self, jobs)
    if (no) return refused(no)
    ending.set(pid, toEnding(row, self.uid))
    return { pid, startedAt, status: 'would-stop', ...(req.tree ? { tree: pullTree(pid) } : {}) }
  }

  const results = req.targets.map(resolve)
  return { results, wouldEnd: [...ending.values()], skipped }
}

function signal(pid: number, sig: NodeJS.Signals): void {
  try {
    process.kill(pid, sig)
  } catch {
    // already gone
  }
}

/** Polls until every process has exited (a zombie counts as exited) or `ms` passed. */
async function survivors(procs: EndingProcess[], ms: number): Promise<EndingProcess[]> {
  const deadline = Date.now() + ms
  let alive = procs
  while (alive.length && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    const rows = new Map((await readPs(alive.map((p) => p.pid))).map((r) => [r.pid, r]))
    alive = alive.filter((p) => {
      const r = rows.get(p.pid)
      return r && r.startedAt === p.startedAt && !r.zombie
    })
  }
  return alive
}

/** SIGKILL the survivors that are still the same process; returns those that outlived even that. */
async function forceKill(
  alive: EndingProcess[],
): Promise<{ killed: Set<number>; left: EndingProcess[] }> {
  const rows = new Map((await readPs(alive.map((p) => p.pid))).map((r) => [r.pid, r]))
  const same = alive.filter((p) => rows.get(p.pid)?.startedAt === p.startedAt)
  for (const p of same) signal(p.pid, 'SIGKILL')
  return { killed: new Set(same.map((p) => p.pid)), left: await survivors(same, KILL_WAIT_MS) }
}

export async function stopProcesses(req: StopRequest): Promise<StopResponse> {
  const [rows, jobs] = await Promise.all([readPs(), readLaunchd()])
  const uid = process.getuid?.() ?? -1
  const pgid = rows.find((r) => r.pid === process.pid)?.pgid ?? process.pid
  const plan = planStop(rows, jobs, req, { pid: process.pid, pgid, uid })
  const dryRun = Boolean(req.dryRun)
  if (dryRun || !plan.wouldEnd.length)
    return { dryRun, generatedAt: new Date().toISOString(), ...plan }

  for (const p of plan.wouldEnd) signal(p.pid, 'SIGTERM') // parents first: no supervisor respawns
  let left = await survivors(plan.wouldEnd, GRACE_MS)
  let killed = new Set<number>()
  if (req.force && left.length) ({ killed, left } = await forceKill(left))
  invalidateSnapshot()

  const running = new Set(left.map((p) => p.pid))
  const results = plan.results.map((r): StopResult => {
    if (r.status !== 'would-stop') return r
    const own = [r.pid, ...(r.tree ?? [])]
    if (own.some((pid) => running.has(pid))) return { ...r, status: 'still-running' }
    return { ...r, status: own.some((pid) => killed.has(pid)) ? 'killed' : 'stopped' }
  })
  return { dryRun, generatedAt: new Date().toISOString(), ...plan, results }
}

const MAX_TARGETS = 200
const isFlag = (v: unknown) => v === undefined || typeof v === 'boolean'
const isTarget = (t: unknown): t is StopTarget =>
  typeof t === 'object' &&
  t !== null &&
  Number.isInteger((t as StopTarget).pid) &&
  typeof (t as StopTarget).startedAt === 'string'

/** The request body, or why it is malformed (400). A refused target is not malformed. */
export function parseStopRequest(body: unknown): StopRequest | string {
  const b = (body ?? {}) as Record<string, unknown>
  const { targets, tree, force, dryRun } = b
  if (!Array.isArray(targets) || !targets.length || targets.length > MAX_TARGETS)
    return `targets must be 1–${MAX_TARGETS} { pid, startedAt } entries`
  if (!targets.every(isTarget)) return 'every target needs an integer pid and a startedAt string'
  if (![tree, force, dryRun].every(isFlag)) return 'tree, force and dryRun are booleans'
  return { targets, tree: tree === true, force: force === true, dryRun: dryRun === true }
}
