/**
 * The process snapshot contract: GET /api/processes and POST /api/processes/stop, behind /processes,
 * /ports and `atlas ps|kill`. atlas-cli mirrors these types (atlas-cli/src/processes.ts) — change
 * both together. Units: bytes, seconds, % of one core, ISO 8601. This Mac only.
 */

/** What a process is, by the binary family or tool it runs. `tool` names the tool inside it. */
export type ProcessKind =
  | 'claude'
  | 'codex'
  | 'mcp'
  | 'language-server'
  | 'bun'
  | 'node'
  | 'deno'
  | 'uv'
  | 'python'
  | 'cargo'
  | 'rustc'
  | 'go'
  | 'dolt'
  | 'beads'
  | 'docker'
  | 'caddy'
  | 'ollama'
  | 'shell'
  | 'app'
  | 'system'
  | 'other'

export const PROCESS_KINDS: readonly ProcessKind[] = [
  'claude',
  'codex',
  'mcp',
  'language-server',
  'bun',
  'node',
  'deno',
  'uv',
  'python',
  'cargo',
  'rustc',
  'go',
  'dolt',
  'beads',
  'docker',
  'caddy',
  'ollama',
  'shell',
  'app',
  'system',
  'other',
]

export type ProcessFlag = 'orphan' | 'duplicate' | 'idle' | 'heavy'

export interface ProcessProject {
  name: string
  path: string
  slug?: string
}

export interface ProcessInfo {
  pid: number
  ppid: number
  pgid: number
  uid: number
  /** From `ps lstart`. pid + startedAt is a process's identity; a reused pid has another start. */
  startedAt: string
  kind: ProcessKind
  /** vite, next, wrangler, tsx, uvicorn, jupyter, tsserver, an MCP server's name… */
  tool?: string
  name: string
  /** The kernel's executable name (`ps ucomm`). */
  exe: string
  /** argv with secrets redacted server-side; '' when ps could not read it. */
  command: string
  argsUnavailable?: true
  zombie?: true
  cpu: number
  /** Accumulated CPU seconds. */
  cpuTime: number
  rss: number
  uptime: number
  cwd?: string
  project?: ProcessProject
  via?: 'cwd' | 'args' | 'group'
  ports?: number[]
  /** launchd label of the pid or its process group. */
  launchd?: string
  /** Started by `POST /api/run`: stdout goes to ~/dev/.atlas-logs/<slug>.log. */
  atlasRun?: { log: string }
  /** CLD_SESSION_NAME of the agent session that spawned it — the only variable ever read. */
  session?: string
}

/** One app row: a process group folded into the process doing the work (`uv run` → its python). */
export interface AppRow {
  /** `<pgid>@<primary's startedAt>` — unique and stable across polls. */
  id: string
  pgid: number
  /** pid of the main process the row is named after. */
  primary: number
  kind: ProcessKind
  tool?: string
  name: string
  project?: ProcessProject
  /** A development process — the default view. Apps and system rows need `all=1`. */
  dev: boolean
  pids: number[]
  /** Sums over `pids`, except uptime: the oldest member's. */
  cpu: number
  cpuTime: number
  rss: number
  uptime: number
  ports: number[]
  session?: string
  launchd?: string
  atlasRun?: { log: string; slug?: string; hostname?: string }
  flags: ProcessFlag[]
  orphanReason?: 'parent-exited' | 'folder-gone'
  /** ids of the other rows serving the same checkout. */
  duplicateOf?: string[]
  heavyBy?: ('rss' | 'cpu')[]
}

export interface TopEntry {
  id: string
  name: string
  kind: ProcessKind
  rss: number
  cpu: number
}

export interface SystemMemory {
  memTotal: number
  pressure: 'normal' | 'warn' | 'critical'
  freePercent: number
  swapTotal: number
  swapUsed: number
  loadAvg: [number, number, number]
  /** Over ALL rows, whatever the filter. */
  topByRss: TopEntry[]
  topByCpu: TopEntry[]
}

/** Oldest sample first; one sample per fresh snapshot, so only while someone is asking. */
export interface RowHistory {
  cpu: number[]
  rss: number[]
}

/**
 * GET /api/processes — query: all=1 · project=<path|name|slug>[,…] · kind=<kind>[,…] · fresh=1 ·
 * history=1. An unknown kind is 400 `{ error, kinds }`.
 */
export interface ProcessSnapshot {
  generatedAt: string
  host: string
  self: { pid: number; pgid: number }
  system: SystemMemory
  /** Flagged first, then by project, then by rss descending. */
  rows: AppRow[]
  /** Exactly the members of `rows`. */
  processes: ProcessInfo[]
  /** Keyed by row id; only with history=1. */
  history?: Record<string, RowHistory>
}

export interface StopTarget {
  pid: number
  startedAt: string
}

/**
 * POST /api/processes/stop. SIGTERM; `force` adds SIGKILL for whatever still runs 5s later (after
 * re-checking pid + start time). `tree` adds every descendant. `dryRun` signals nothing.
 */
export interface StopRequest {
  targets: StopTarget[]
  tree?: boolean
  force?: boolean
  dryRun?: boolean
}

export type StopRefusal =
  | 'pid-reused'
  | 'protected-pid'
  | 'other-user'
  | 'atlas-api'
  | 'launchd-job'
  | 'zombie'

export interface StopResult {
  pid: number
  startedAt: string
  status: 'would-stop' | 'stopped' | 'killed' | 'still-running' | 'gone' | 'refused'
  refusal?: StopRefusal
  /** The launchd label behind a `launchd-job` refusal — restart it through /api/daemons instead. */
  label?: string
  tree?: number[]
}

export interface EndingProcess {
  pid: number
  ppid: number
  pgid: number
  startedAt: string
  kind: ProcessKind
  name: string
  command: string
}

/** Always 200 for a well-formed body, even when every target is refused; malformed is 400. */
export interface StopResponse {
  dryRun: boolean
  generatedAt: string
  /** One per target, in request order. */
  results: StopResult[]
  /** Every process that ends (or would): targets plus tree members that passed the checks. */
  wouldEnd: EndingProcess[]
  /** Tree members refused on their own. */
  skipped: { pid: number; name: string; refusal: StopRefusal; label?: string }[]
}
