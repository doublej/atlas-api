import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listenersOf } from '../listeners'
import type { Project } from '../scanner'
import { buildRows, classifyRows } from './groups'
import { type PsRow, parseLaunchctl, parseLsof, parsePs, parseSysctl, redact } from './parse'
import type { Snapshot } from './snapshot'
import { parseViewQuery, viewOf } from './view'

describe('redact', () => {
  it.each([
    [
      'mcp-remote https://x --header Authorization: Bearer abc.def',
      'Authorization: Bearer REDACTED',
    ],
    ['ssh host PATH=x DECKHAND_TOKEN=abc123 exec y', 'DECKHAND_TOKEN=REDACTED exec y'],
    [
      'tool --token abc --api-key=def --client-secret "g h"',
      '--token REDACTED --api-key=REDACTED --client-secret REDACTED',
    ],
    ['git clone https://jj:pa55@github.com/x.git', 'https://REDACTED@github.com/x.git'],
    [
      'env OPENAI_API_KEY=sk-1 DB_PASSWORD=p MY_SECRET=s node x',
      'OPENAI_API_KEY=REDACTED DB_PASSWORD=REDACTED MY_SECRET=REDACTED',
    ],
  ])('%s', (command, expected) => expect(redact(command)).toContain(expected))

  it('leaves an ordinary command alone', () => {
    const cmd = 'node node_modules/.bin/vite dev --host 0.0.0.0 --port 4123 --max-tokens 5'
    expect(redact(cmd)).toBe(cmd)
  })
})

describe('parsers', () => {
  it('lsof: cwd and a regular-file stdout per pid', () => {
    const out =
      'p10\nfcwd\nn/Users/x/dev/a\nf1\nn/Users/x/dev/.atlas-logs/a.log\np11\nfcwd\nn/\nf1\nn/dev/null\n'
    expect(parseLsof(out)).toEqual(
      new Map([
        [10, { cwd: '/Users/x/dev/a', stdout: '/Users/x/dev/.atlas-logs/a.log' }],
        [11, { cwd: '/' }],
      ]),
    )
  })

  it('launchctl: running jobs only', () => {
    const out = 'PID\tStatus\tLabel\n977\t0\tcom.jurrejan.atlas-api\n-\t0\tcom.apple.idle\n'
    expect(parseLaunchctl(out)).toEqual(new Map([[977, 'com.jurrejan.atlas-api']]))
  })

  it('sysctl: pressure, free share and swap in bytes', () => {
    const out =
      '2\n47\ntotal = 9216.00M  used = 8741.06M  free = 474.94M  (encrypted)\n17179869184\n'
    expect(parseSysctl(out)).toEqual({
      pressure: 'warn',
      freePercent: 47,
      swapTotal: 9216 * 2 ** 20,
      swapUsed: Math.round(8741.06 * 2 ** 20),
      memTotal: 17179869184,
    })
  })
})

const FIXTURE = parsePs(
  readFileSync(new URL('./ps-fixture.txt', import.meta.url), 'latin1')
    .split('\n')
    .slice(1)
    .join('\n'),
)
/** A credential the way it shows up in real argv: a header, a remote env var, a flag, a URL. */
const TOKEN = 'dk_live_7f3a9c1e5b'
const leaky = (pid: number, args: string): PsRow => ({
  ...(FIXTURE.find((r) => r.pid === 23074) as PsRow),
  pid,
  ppid: 1,
  pgid: pid,
  args,
})
const ROWS = [
  ...FIXTURE,
  leaky(90101, `ssh ubuntu DECKHAND_TOKEN=${TOKEN} exec uv run deckhand`),
  leaky(90102, `node /tmp/mcp-remote https://mcp.example --header Authorization: Bearer ${TOKEN}`),
  leaky(90103, `bun /tmp/srv.ts --token=${TOKEN} --db https://jj:${TOKEN}@db.example`),
]

function snapshotOf(rows: PsRow[]): Snapshot {
  const projects = [{ name: 'tmp', slug: 'tmp', path: '/tmp', isLocal: true }] as Project[]
  const { processes, rows: appRows } = buildRows(classifyRows(rows, 501), {
    now: Date.now(),
    files: new Map(),
    ports: new Map([[90103, [4999]]]),
    launchd: new Map(),
    sessions: new Map(),
    projects,
    realDir: (d) => d,
    exists: () => true,
    logDir: '/nowhere',
    hostnames: new Map(),
  })
  const sockets = [90101, 90102, 90103].map((pid, i) => ({
    port: 4997 + i,
    pid,
    address: '*',
    command: 'x',
  }))
  return {
    generatedAt: new Date().toISOString(),
    self: { pid: 977, pgid: 977 },
    system: {} as Snapshot['system'],
    rows: appRows,
    processes,
    byPid: new Map(processes.map((p) => [p.pid, p])),
    sockets,
    docker: new Map(),
    projects,
    hostnames: [],
  }
}

describe('nothing secret leaves the server', () => {
  const snap = snapshotOf(ROWS)
  const all = { all: true, projects: [], kinds: [], history: false }

  it('positive control: the token is in the raw rows', () => {
    expect(JSON.stringify(ROWS)).toContain(TOKEN)
  })

  it('GET /api/processes never carries the token', () => {
    const view = JSON.stringify(viewOf(snap, all))
    expect(view).toContain('DECKHAND_TOKEN=REDACTED')
    expect(view).not.toContain(TOKEN)
  })

  it('GET /api/ports/listeners never carries the token', () => {
    const listeners = listenersOf(snap, [])
    expect(listeners.map((l) => l.pid)).toEqual([90101, 90102, 90103])
    expect(JSON.stringify(listeners)).not.toContain(TOKEN)
  })
})

describe('viewOf', () => {
  const snap = snapshotOf(FIXTURE)
  const view = (q: string) => {
    const parsed = parseViewQuery(new URLSearchParams(q))
    if ('error' in parsed) throw new Error(parsed.error)
    return viewOf(snap, parsed)
  }

  it('defaults to development rows, `all=1` shows everything', () => {
    expect(view('').rows.every((r) => r.dev)).toBe(true)
    expect(view('all=1').rows.length).toBe(snap.rows.length)
  })

  it('filters by kind and holds exactly the members of the rows it returns', () => {
    const v = view('kind=claude,codex')
    expect(new Set(v.rows.map((r) => r.kind))).toEqual(new Set(['claude', 'codex']))
    expect(v.processes.map((p) => p.pid).sort()).toEqual(v.rows.flatMap((r) => r.pids).sort())
  })

  it('refuses an unknown kind and lists the valid ones', () => {
    const q = parseViewQuery(new URLSearchParams('kind=agent'))
    expect(q).toMatchObject({ error: 'unknown kind: agent' })
    expect('kinds' in q && q.kinds).toContain('claude')
  })
})
