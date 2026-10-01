/** Pure parsers for what the snapshot reads: ps, lsof, launchctl, sysctl. No I/O here. */

/** Every column the snapshot needs from one `ps`; `args` last, the only unpadded, untruncated one. */
export const PS_COLUMNS = 'pid=,ppid=,pgid=,uid=,rss=,%cpu=,time=,lstart=,ucomm=,args='

export interface PsRow {
  pid: number
  ppid: number
  pgid: number
  uid: number
  /** bytes */
  rss: number
  cpu: number
  cpuTime: number
  startedAt: string
  /** Epoch ms of `startedAt`, for uptime. */
  started: number
  /** The kernel's executable basename (`ucomm`), ≤16 bytes, may be clipped. */
  exe: string
  /** Raw argv as ps prints it (vis-encoded). Never leaves the server unredacted. */
  args: string
  argsUnavailable?: true
  zombie?: true
}

// 1 pid 2 ppid 3 pgid 4 uid (nobody is -2) 5 rss KiB 6 %cpu 7+8 cpu time min:ss.cc 9 lstart
// 10 ucomm, a fixed 16-byte column 11 args. Whitespace tokens, never header offsets: rss overflows
// its column past 1 GB.
const ROW =
  /^ *(\d+) +(\d+) +(\d+) +(-?\d+) +(\d+) +(\d+\.\d+) +(\d+):(\d\d\.\d\d) +(\w{3} \w{3} [ \d]\d \d\d:\d\d:\d\d \d{4}) +(.{16}) (.*)$/

/**
 * `LC_ALL=C ps -axww -o PS_COLUMNS` decoded as latin1 (one char per byte), so the 16-byte ucomm
 * column slices exactly; only ucomm is decoded back to UTF-8 (args are vis-encoded ASCII).
 */
export function parsePs(latin1: string): PsRow[] {
  const rows: PsRow[] = []
  for (const line of latin1.split('\n')) {
    const m = line.match(ROW)
    if (!m) continue
    const exe = Buffer.from(m[10].trimEnd(), 'latin1').toString('utf8')
    const args = m[11].trimEnd() // retitled processes pad with spaces: "Raycast Backend  "
    const started = new Date(m[9]).getTime() // lstart is local time; Date parses it as such
    rows.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      pgid: Number(m[3]),
      uid: Number(m[4]),
      rss: Number(m[5]) * 1024,
      cpu: Number(m[6]),
      cpuTime: Number(m[7]) * 60 + Number(m[8]),
      startedAt: new Date(started).toISOString(),
      started,
      exe,
      args,
      ...(args === `(${exe})` ? { argsUnavailable: true as const } : {}),
      ...(args === '<defunct>' ? { zombie: true as const } : {}),
    })
  }
  return rows
}

/** A value: quoted as a whole, else up to the next space. */
const VALUE = `("[^"]*"|'[^']*'|\\S+)`
/**
 * A flag, variable or JSON key that names a credential. A word that can also mean something
 * harmless must be the name's last word, so `--private-key`, `OPENAI_KEY` and `--github-pat` are
 * masked while `--key-file`, `--session-id`, `--max-tokens` and `--password-stdin` stay readable.
 * ponytail: the name's prefix is capped at 64 chars, or a long dotted/dashed argv token costs
 * seconds (every start position scans to its end); a longer prefix with no `.`/`-` goes unmasked.
 */
const SECRET_NAME =
  '(?:[\\w.-]{0,64}?(?:password|passwd|secret|token)|(?:[\\w.-]{0,64}[-_.])?(?:pass(?:phrase)?|pw|(?:api|access|private|secret)?key|auth(?:orization)?|cred(?:s|entials?)?|cookie|session|pat))'
// Values that are credentials, wherever they appear in a command line.
const SECRETS: [RegExp, string][] = [
  [new RegExp(`(\\b(?:Bearer|Basic)\\s+)${VALUE}`, 'gi'), '$1REDACTED'],
  // `--token x`, `--key=x`, `--auth<TAB>x`, from a flag's first dash (not `no-auth`'s); a
  // `--no-…` flag and a spaced `-…` value are switches, not values.
  [
    new RegExp(`((?<![\\w-])--?(?!-?no-)${SECRET_NAME}(?:=|[ \\t]+(?!-)))${VALUE}`, 'gi'),
    '$1REDACTED',
  ],
  // `DECKHAND_TOKEN=`, `OPENAI_KEY=`, `?access_token=…&` — a query value ends at `&`.
  [new RegExp(`\\b(${SECRET_NAME}=)("[^"]*"|'[^']*'|[^&\\s]+)`, 'gi'), '$1REDACTED'],
  [new RegExp(`("${SECRET_NAME}"\\s*:\\s*)"[^"]*"`, 'gi'), '$1"REDACTED"'],
  // `Cookie: a=1; b=2`, every pair — before the header rule, whose value stops at the first `;`.
  [/(\bcookie:\s*)[^;\s]+(?:;\s*[^;\s]+)*/gi, '$1REDACTED'],
  // `-H "X-Shopify-Access-Token: …"`, `PRIVATE-TOKEN: …`, httpie's `Api-Key:…`.
  [
    new RegExp(
      `(\\b${SECRET_NAME}:\\s*(?:(?:Bearer|Basic|Token|Digest|Negotiate)\\s+)?)${VALUE}`,
      'gi',
    ),
    '$1REDACTED',
  ],
  [new RegExp(`(\\baws\\s+configure\\s+set\\s+${SECRET_NAME}[ \\t]+)${VALUE}`, 'gi'), '$1REDACTED'],
  // `user:pass@` and a token used as the user (`https://ghp_…@github.com`).
  [/(\w+:\/\/)[^/\s@]+@/g, '$1REDACTED@'],
  // Tokens that say what they are, wherever they stand.
  [/\b(sk-ant-|sk-|gh[pousr]_|github_pat_|glpat-|xox[abpr]-)[\w-]{20,}/g, '$1REDACTED'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIAREDACTED'],
  // Short flags that are a password only for their own tool: `mysql -pS3cret` (a bare `-p`
  // prompts), `sshpass -p x`, `redis-cli -a x`; `curl -u user:pass` keeps the user.
  [/(\b(?:mysql|mariadb)\w*\b.*?\s-p)[^\s-]\S*/g, '$1REDACTED'],
  [
    new RegExp(`(\\b(?:sshpass\\b.*?\\s-p|redis-cli\\b.*?\\s-a)[ \\t]*)${VALUE}`, 'g'),
    '$1REDACTED',
  ],
  [/(\bcurl\b.*?\s(?:-[uU][ \t]*|--(?:proxy-)?user(?:=|[ \t]+))[^\s:]+:)\S+/g, '$1REDACTED'],
]

/** A command line with every credential value replaced. Runs before anything leaves the server. */
export function redact(command: string): string {
  return SECRETS.reduce((s, [re, to]) => s.replace(re, to), command)
}

export interface OpenFiles {
  cwd?: string
  /** fd 1 when it is a regular file: where a process logs. */
  stdout?: string
}

/** A name on fd 1 that is a regular file, not a tty, pipe or `/dev/null`. */
const isLogFile = (name: string) => name.startsWith('/') && !name.startsWith('/dev/')

function setName(entry: OpenFiles, fd: string, name: string): void {
  if (fd === 'cwd') entry.cwd = name
  else if (fd === '1' && isLogFile(name)) entry.stdout = name
}

/** `lsof -Fpfn -d cwd,1`: `p<pid>`, then `f<fd>` + `n<name>` pairs. */
export function parseLsof(out: string): Map<number, OpenFiles> {
  const files = new Map<number, OpenFiles>()
  let entry: OpenFiles = {}
  let fd = ''
  for (const line of out.split('\n')) {
    const value = line.slice(1)
    if (line[0] === 'p') {
      entry = {}
      files.set(Number(value), entry)
    } else if (line[0] === 'f') fd = value
    else if (line[0] === 'n') setName(entry, fd, value)
  }
  return files
}

/** `launchctl list` (`PID\tStatus\tLabel`) → pid → label, running jobs only. */
export function parseLaunchctl(out: string): Map<number, string> {
  const jobs = new Map<number, string>()
  for (const line of out.split('\n')) {
    const [pid, , label] = line.split('\t')
    if (/^\d+$/.test(pid) && label) jobs.set(Number(pid), label)
  }
  return jobs
}

/** The sysctl names read, in the order `parseSysctl` expects their lines. */
export const SYSCTL_NAMES = [
  'kern.memorystatus_vm_pressure_level',
  'kern.memorystatus_level',
  'vm.swapusage',
  'hw.memsize',
]

const UNIT: Record<string, number> = { K: 2 ** 10, M: 2 ** 20, G: 2 ** 30 }
const PRESSURE: Record<string, 'normal' | 'warn' | 'critical'> = {
  '1': 'normal',
  '2': 'warn',
  '4': 'critical',
}

/** `LC_ALL=C sysctl -n SYSCTL_NAMES…` → memory facts. A missing line reads as zero. */
export function parseSysctl(out: string) {
  const [level = '', free = '', swap = '', mem = ''] = out.split('\n')
  const swapBytes = (key: string) => {
    const m = swap.match(new RegExp(`${key} = ([\\d.]+)([KMG])`))
    return m ? Math.round(Number(m[1]) * UNIT[m[2]]) : 0
  }
  return {
    pressure: PRESSURE[level.trim()] ?? 'normal',
    freePercent: Number(free) || 0,
    swapTotal: swapBytes('total'),
    swapUsed: swapBytes('used'),
    memTotal: Number(mem) || 0,
  }
}
