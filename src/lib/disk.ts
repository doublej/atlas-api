/**
 * The web console's side of `atlas disk`. Every operation shells out to the CLI — never a
 * reimplementation: the CLI owns the approval policy, the operation log, the job lock and
 * recovery. Reads run `atlas disk … --json` and wait; changes run as a **job**, a detached
 * `atlas disk job` child writing to `<ATLAS_DISK_HOME>/jobs/<id>.log`, which the page polls.
 * Nothing is passed through a shell, and every argument is checked against the allowlist below.
 */
import { execFile, spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { error } from '@sveltejs/kit'

const execFileAsync = promisify(execFile)

/** The zsh `atlas` wrapper isn't visible to launchd; the bun-linked bin is. */
const ATLAS_BIN = process.env.ATLAS_BIN ?? join(homedir(), '.bun', 'bin', 'atlas')
const READ_TIMEOUT_MS = 120_000

/** Same resolution as the CLI's `stateDir()`: `ATLAS_DISK_HOME` moves everything. */
const stateDir = () =>
  process.env.ATLAS_DISK_HOME ?? join(homedir(), 'Library', 'Application Support', 'atlas-disk')
const jobsDir = () => join(stateDir(), 'jobs')

export type ExitName = 'ok' | 'error' | 'nothing' | 'partial' | 'refused'
export interface DiskItem {
  item: string
  outcome: 'done' | 'skipped' | 'refused' | 'failed'
  reason?: string
  needs?: string
  [key: string]: unknown
}
/** The CLI's `--json` contract (`atlas-cli/src/disk/report.ts`). */
export interface DiskResult {
  command: string
  exit: ExitName
  message?: string
  error?: string
  items?: DiskItem[]
  data?: unknown
}

// ── argument allowlist ────────────────────────────────────────────────────────────────────────

/** `<category>/<project>` or a version id `<category>/<project>@<YYYYMMDD-HHMMSS>`. */
export const ID = /^[\w.-]+\/[\w. -]+(@[\d-]+)?$/
const OP_ID = /^\d{8}-\d{6}-[0-9a-f]{6}$/
const NUM = /^\d{1,6}$/
const ABS = /^\/[^\0]*$/
const TEXT = /^[^\0]{1,500}$/

interface Rule {
  /** First positional, when the command has verbs. */
  verbs?: string[]
  /** Every other positional. */
  pos?: RegExp
  bools?: string[]
  values?: Record<string, RegExp>
  /** Everything after `--` is free text matching this (log note). */
  rest?: RegExp
}

const RULES: Record<string, Rule> = {
  analyze: { bools: ['cached'], values: { 'min-size': NUM } },
  scan: {
    bools: ['cached'],
    values: { 'min-size': NUM, risk: /^(rebuildable|reinstallable|review)$/ },
  },
  archive: {
    pos: ID,
    bools: ['eligible', 'keep-rebuildable', 'dry-run'],
    values: { compression: /^(none|fast|strong|\d{1,2})$/, to: ABS, 'confirm-dirty': ID },
  },
  restore: { pos: ID, bools: ['keep-archive', 'dry-run'] },
  archives: {
    verbs: ['list', 'contents', 'check', 'delete', 'prune', 'evict'],
    pos: ID,
    values: { keep: NUM },
  },
  clean: { pos: ABS, bools: ['trash', 'permanent', 'dry-run'] },
  trim: { bools: ['rust-sweep', 'dry-run'] },
  config: { verbs: ['get', 'set', 'reset'], pos: /^[^\0]{0,1000}$/ },
  schedule: {
    verbs: ['status', 'enable', 'disable', 'set'],
    pos: /^(scan|trim)$/,
    values: { at: /^\w{1,9} \d{1,2}:\d{2}$/ },
  },
  doctor: {},
  log: {
    verbs: ['skip', 'note'],
    pos: ABS,
    bools: ['pending'],
    values: { run: OP_ID, limit: NUM, op: /^[a-z-]+$/, reason: TEXT },
    rest: TEXT,
  },
  recover: { verbs: ['list', 'finish', 'undo'], pos: OP_ID },
}

type Bad = (why: string) => never

/** Check `args` against the command's rule; throws a 400 naming the first bad token. */
export function checkArgs(command: string, args: string[]): void {
  const rule = RULES[command]
  if (!rule) error(400, `unknown disk command '${command}'`)
  const bad: Bad = (why) => error(400, `${command}: ${why}`)
  if (!args.every((a) => typeof a === 'string')) bad('arguments must be strings')
  const sep = args.indexOf('--')
  if (sep >= 0 && !(rule.rest && sep === args.length - 2 && rule.rest.test(args[sep + 1])))
    bad('unexpected --')
  checkPositionals(takeFlags(sep >= 0 ? args.slice(0, sep) : args, rule, bad), rule, bad)
}

/** One `--flag [value]` at `i`; returns how many tokens it took. */
function takeFlag(args: string[], i: number, rule: Rule, bad: Bad): number {
  const name = args[i].slice(2)
  if (rule.bools?.includes(name)) return 1
  const re = rule.values?.[name] ?? bad(`flag --${name} is not allowed`)
  if (!re.test(args[i + 1] ?? '')) bad(`bad value for --${name}`)
  return 2
}

/** Check every flag; returns the positionals left over. */
function takeFlags(args: string[], rule: Rule, bad: Bad): string[] {
  const positional: string[] = []
  for (let i = 0; i < args.length; ) {
    if (args[i].startsWith('--')) i += takeFlag(args, i, rule, bad)
    else positional.push(args[i++])
  }
  return positional
}

/** The first positional is the verb when the command has verbs; the rest must match `pos`. */
function checkPositionals(positional: string[], rule: Rule, bad: Bad): void {
  const verb = rule.verbs ? positional[0] : undefined
  const rest = rule.verbs ? positional.slice(1) : positional
  if (verb !== undefined && !rule.verbs?.includes(verb)) bad(`verb '${verb}' is not allowed`)
  const wrong = rest.find((a) => !rule.pos?.test(a))
  if (wrong !== undefined) bad(`bad argument '${wrong}'`)
}

/** The first positional, skipping flag values (`--limit 300`) and the free text after `--`. */
function verbOf(command: string, args: string[]): string | undefined {
  const sep = args.indexOf('--')
  const bad: Bad = (why) => error(400, `${command}: ${why}`)
  return takeFlags(sep >= 0 ? args.slice(0, sep) : args, RULES[command] ?? {}, bad)[0]
}

/** Verbs that only read, per command (`undefined` = no verb, the command's default). */
const READ_VERBS: Record<string, (string | undefined)[]> = {
  archives: [undefined, 'list', 'contents'],
  config: [undefined, 'get'],
  schedule: [undefined, 'status'],
  log: [undefined],
  recover: [undefined, 'list'],
}

/** Side-effect free: cached reads, listings, status, and every `--dry-run`. */
export function isRead(command: string, args: string[]): boolean {
  if (command === 'doctor') return true
  if (command === 'analyze' || command === 'scan') return args.includes('--cached')
  if (['archive', 'restore', 'clean', 'trim'].includes(command)) return args.includes('--dry-run')
  return READ_VERBS[command]?.includes(verbOf(command, args)) ?? false
}

/**
 * A change the page already confirmed: `--confirmed` goes before any `--` (after it is free
 * text), and never in front of the verb — `log` routes on its first argument.
 */
export function withConfirmed(args: string[]): string[] {
  const sep = args.indexOf('--')
  return sep < 0
    ? [...args, '--confirmed']
    : [...args.slice(0, sep), '--confirmed', ...args.slice(sep)]
}

/** Changes that finish in about a second and run synchronously rather than as a job. */
export const isQuickWrite = (command: string, args: string[]) =>
  (command === 'config' || command === 'schedule') && !isRead(command, args)

// ── running the CLI ───────────────────────────────────────────────────────────────────────────

/** `atlas disk <args> --json`, stdout kept on a non-zero exit (refused/partial still report). */
export async function diskJson(args: string[]): Promise<DiskResult> {
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync(ATLAS_BIN, ['disk', ...args, '--json'], {
      timeout: READ_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    }))
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message: string }
    stdout = err.stdout ?? ''
    if (!stdout.trim()) throw new Error(err.stderr?.trim() || err.message)
  }
  return JSON.parse(stdout) as DiskResult
}

/** Clean paths must be rows of the saved scan — the CLI refuses the rest too; this refuses earlier. */
export async function checkCleanPaths(args: string[]): Promise<void> {
  const paths = args.filter((a) => a.startsWith('/'))
  if (!paths.length) return
  const scan = await diskJson(['scan', '--cached'])
  const known = new Set(
    ((scan.data as { folders?: { path: string }[] })?.folders ?? []).map((f) => f.path),
  )
  const missing = paths.find((p) => !known.has(p))
  if (missing) error(400, `clean: ${missing} is not in the saved scan`)
}

// ── jobs ──────────────────────────────────────────────────────────────────────────────────────

export interface JobMeta {
  id: string
  args: string[]
  pgid: number
  startedAt: string
}
export interface JobState extends JobMeta {
  done: boolean
  /** Exit code from `<log>.exit`; null while running, or when the job died without writing it. */
  exit: number | null
}

const JOB_ID = /^\d+-[a-z]+$/
const logOf = (id: string) => join(jobsDir(), `${id}.log`)

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Start `atlas disk <args>` as a job in its own process group. It outlives an atlas-api restart. */
export function startJob(args: string[]): JobMeta {
  mkdirSync(jobsDir(), { recursive: true })
  const id = `${Date.now()}-${args[0]}`
  const log = logOf(id)
  writeFileSync(log, `$ atlas disk ${args.join(' ')}\n`)
  const child = spawn(ATLAS_BIN, ['disk', 'job', '--log', log, '--', ...args], {
    detached: true,
    stdio: 'ignore',
  })
  // A spawn failure (no atlas bin) must not crash the daemon; it ends the job as an error.
  child.on('error', (e) => {
    writeFileSync(log, `${e.message}\n`, { flag: 'a' })
    writeFileSync(`${log}.exit`, '1')
  })
  child.unref()
  const meta: JobMeta = { id, args, pgid: child.pid ?? 0, startedAt: new Date().toISOString() }
  writeFileSync(join(jobsDir(), `${id}.json`), JSON.stringify(meta))
  return meta
}

function jobMeta(id: string): JobMeta {
  if (!JOB_ID.test(id)) error(400, 'bad job id')
  const file = join(jobsDir(), `${id}.json`)
  if (!existsSync(file)) error(404, `no job ${id}`)
  return JSON.parse(readFileSync(file, 'utf8')) as JobMeta
}

function jobState(meta: JobMeta): JobState {
  const exitFile = `${logOf(meta.id)}.exit`
  const exit = existsSync(exitFile) ? Number(readFileSync(exitFile, 'utf8')) : null
  return { ...meta, exit, done: exit !== null || !alive(meta.pgid) }
}

/**
 * The log from byte `offset` on. While the job runs only whole lines are returned, so a
 * multi-byte mark (✓ ⊘ ✗) is never split between two polls.
 */
export function readJob(id: string, offset: number): JobState & { text: string; offset: number } {
  const state = jobState(jobMeta(id))
  const log = logOf(id)
  const size = existsSync(log) ? statSync(log).size : 0
  const buf = Buffer.alloc(Math.max(0, size - offset))
  if (buf.length) {
    const fd = openSync(log, 'r')
    readSync(fd, buf, 0, buf.length, offset)
    closeSync(fd)
  }
  const end = state.done ? buf.length : buf.lastIndexOf(0x0a) + 1
  return { ...state, text: buf.subarray(0, end).toString('utf8'), offset: offset + end }
}

/** SIGINT to the job's group: the CLI stops at its next safe point and still writes its exit. */
export function cancelJob(id: string): void {
  const state = jobState(jobMeta(id))
  if (!state.done) process.kill(-state.pgid, 'SIGINT')
}

/** The web console's jobs, newest first (the terminal screen's logs have no `.json`). */
export function listJobs(limit = 20): JobState[] {
  if (!existsSync(jobsDir())) return []
  return readdirSync(jobsDir())
    .filter((f) => f.endsWith('.json') && JOB_ID.test(f.slice(0, -5)))
    .sort()
    .reverse()
    .slice(0, limit)
    .map((f) => jobState(JSON.parse(readFileSync(join(jobsDir(), f), 'utf8')) as JobMeta))
}

// ── the write guard ───────────────────────────────────────────────────────────────────────────

const LOOPBACK_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/
const LOOPBACK_ORIGIN = /^http:\/\/(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/
/** The console's own LAN hostname. The NAS Caddy lets only LAN (and household) IPs through. */
const TRUSTED_HOST = 'atlas.atlas.local.jurrejan.com'

/**
 * Disk writes only from this Mac or the console's LAN hostname. The NAS Caddy rewrites `Host` to
 * `localhost` and sets `x-forwarded-for`/`x-forwarded-host` itself (it ignores client-sent
 * values), so a proxied request is trusted only when it came in on `TRUSTED_HOST` — never
 * `atlas.remote` or a project's hostname. A page on any other origin is refused. Reads stay open.
 */
export function requireLocalRequest(request: Request): void {
  const h = request.headers
  const origin = h.get('origin')
  const direct =
    !h.has('x-forwarded-for') &&
    LOOPBACK_HOST.test(h.get('host') ?? '') &&
    (!origin || LOOPBACK_ORIGIN.test(origin))
  const trusted =
    h.get('x-forwarded-host') === TRUSTED_HOST && (!origin || origin === `https://${TRUSTED_HOST}`)
  if (!direct && !trusted)
    error(
      403,
      'disk changes are allowed only from this Mac or https://atlas.atlas.local.jurrejan.com',
    )
}
