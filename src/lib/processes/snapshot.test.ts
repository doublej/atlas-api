import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listenersOf } from '../listeners'
import type { Project } from '../scanner'
import { topBy } from './flags'
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
    ['git fetch https://ghp_abc@github.com/x.git', 'https://REDACTED@github.com/x.git'],
    ['curl https://x/cb?a=1&access_token=abc&b=2', 'access_token=REDACTED&b=2'],
    ['env github_token=abc x', 'github_token=REDACTED x'],
    ['curl -H x-api-key: abc https://x', 'x-api-key: REDACTED https://x'],
    ['curl -H Authorization: token abc https://x', 'Authorization: token REDACTED https'],
  ])('%s', (command, expected) => expect(redact(command)).toContain(expected))

  // Assembled at run time, so no secret scanner takes this file for a leak.
  const FAKE = 'FAKE'.repeat(6)
  it.each([
    ['mysql -uroot -pFAKEPW01 app', 'FAKEPW01'],
    ['sshpass -p FAKEPW02 ssh host', 'FAKEPW02'],
    ['redis-cli -a FAKEPW03 ping', 'FAKEPW03'],
    ['curl -u jj:FAKEPW04 https://x', 'FAKEPW04'],
    ['curl -H Cookie: theme=dark; sid=FAKEPW05 https://x', 'FAKEPW05'],
    ['node x.js {"token":"FAKEPW06"}', 'FAKEPW06'],
    ['env OPENAI_KEY=FAKEPW07 node x', 'FAKEPW07'],
    ['aws-tool access_key=FAKEPW08', 'FAKEPW08'],
    ['tool --pass FAKEPW09', 'FAKEPW09'],
    ['tool --auth FAKEPW10', 'FAKEPW10'],
    ['tool --pat FAKEPW11', 'FAKEPW11'],
    ['tool --key=FAKEPW12', 'FAKEPW12'],
    ['tool --private-key FAKEPW13', 'FAKEPW13'],
    ['tool --credentials FAKEPW14', 'FAKEPW14'],
    [`proxy sk-ant-api03-${FAKE}`, FAKE],
    ['tool --token\tFAKEPW16', 'FAKEPW16'],
    ['op item get x --session FAKEPW17', 'FAKEPW17'],
    ['mcp-remote --header Authorization: Bearer FAKEPW18', 'FAKEPW18'],
    ['ssh host DECKHAND_TOKEN=FAKEPW19 exec y', 'FAKEPW19'],
    ['tool --api-key=FAKEPW20', 'FAKEPW20'],
    ['tool --client-secret "FAKE PW21"', 'PW21'],
    ['git clone https://jj:FAKEPW22@github.com/x.git', 'FAKEPW22'],
    ['curl https://x/cb?a=1&access_token=FAKEPW23&b=2', 'FAKEPW23'],
    ['curl -H x-api-key: FAKEPW24 https://x', 'FAKEPW24'],
    ['env PGPASSWORD=FAKEPW25 psql', 'FAKEPW25'],
    ['tool --password=FAKEPW26', 'FAKEPW26'],
    ['gh auth login --with-token FAKEPW27', 'FAKEPW27'],
    [`node x.js sk-${FAKE}`, FAKE],
    [`git push https://x ghp_${FAKE}`, FAKE],
    [`echo github_pat_${FAKE}`, FAKE],
    [`glab x glpat-${FAKE}`, FAKE],
    [`node bot.js xoxb-${FAKE}`, FAKE],
    [`run AKIA${FAKE.slice(0, 16)}`, FAKE.slice(0, 16)],
    ['env STRIPE_SECRET_KEY=FAKEPW34 node x', 'FAKEPW34'],
    ['tool --apiKey FAKEPW35 --authToken=FAKEPW36', 'FAKEPW3'],
    ['node x.js {"api_key": "FAKEPW37"}', 'FAKEPW37'],
    ['mysqldump -u root --password FAKEPW38 db', 'FAKEPW38'],
    ['curl -H "X-Shopify-Access-Token: shpat_FAKEPW40" https://x', 'FAKEPW40'],
    ["curl -H 'PRIVATE-TOKEN: FAKEPW41' https://x", 'FAKEPW41'],
    ['curl -H "X-Auth-Token: FAKEPW42" https://x', 'FAKEPW42'],
    ['curl -H "Api-Key: FAKEPW43" https://x', 'FAKEPW43'],
    ['http GET https://x X-Shopify-Access-Token:FAKEPW44', 'FAKEPW44'],
    ['aws configure set aws_secret_access_key FAKEPW45', 'FAKEPW45'],
  ])('masks %s', (command, secret) => {
    expect(redact(command)).not.toContain(secret)
    expect(redact(command)).toContain('REDACTED')
  })

  it('stays linear on a long dotted/dashed argv token', () => {
    const start = performance.now()
    // Uncapped: ~7s under node, worse under bun (the daemon's runtime); capped: ~80ms.
    redact(`node ${'a.-'.repeat(13_000)}`)
    expect(performance.now() - start).toBeLessThan(1_000)
  })

  it.each([
    'bun build/index.js',
    'vite --port 5173',
    'node --max-old-space-size=4096 x.js',
    'python -m http.server 8000',
    'node node_modules/.bin/vite dev --host 0.0.0.0 --port 4123 --max-tokens 5',
    'claude --session-id 3f2a --resume',
    'tmux new-session -s work',
    'rsync -a --keep-dirlinks a b',
    'ssh-agent --key-file id_ed25519',
    'docker login --password-stdin -u jj registry',
    'mysql -u root -p app',
    'ssh -p 2222 host',
    'git log --author=jj',
    'env CLD_SESSION_NAME=atlas PATH=/usr/bin claude',
    'sort -u words.txt',
    'skills-cli --bypass x --no-auth server.js --port 3000',
    'docker run -u 501:20 img',
  ])('leaves %s alone', (command) => expect(redact(command)).toBe(command))
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
  // A runtime that retitled itself: its whole argv becomes the name.
  { ...leaky(90104, `my-worker --token ${TOKEN}`), exe: 'node' },
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
  const sockets = [90101, 90102, 90103, 90104].map((pid, i) => ({
    port: 4997 + i,
    pid,
    address: '*',
    command: 'x',
  }))
  return {
    generatedAt: new Date().toISOString(),
    self: { pid: 977, pgid: 977 },
    system: {
      topByRss: topBy(appRows, 'rss'),
      topByCpu: topBy(appRows, 'cpu'),
    } as Snapshot['system'],
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
    expect(view).toContain('"name":"my-worker --token REDACTED"')
    expect(view).not.toContain(TOKEN)
  })

  it('GET /api/ports/listeners never carries the token', () => {
    const listeners = listenersOf(snap, [])
    expect(listeners.map((l) => l.pid)).toEqual([90101, 90102, 90103, 90104])
    expect(JSON.stringify(listeners)).not.toContain(TOKEN)
  })
})

describe('listenersOf', () => {
  it("puts a project's dev hostname on the port it routes to only", () => {
    const project = { name: 'web', path: '/w', slug: 'web' }
    const vite = (pid: number) => ({ pid, name: 'vite', command: 'vite', pgid: pid, project })
    const snap = {
      self: { pid: 1, pgid: 1 },
      sockets: [4123, 4451].map((port, i) => ({
        port,
        pid: 10 + i,
        address: '*',
        command: 'node',
      })),
      byPid: new Map([10, 11].map((pid) => [pid, vite(pid)])),
      projects: [{ ...project, port: 4123 }],
      hostnames: [{ slug: 'web', path: '/w', local: 'https://web.local' }],
      docker: new Map(),
    } as unknown as Snapshot
    expect(listenersOf(snap, []).map((l) => [l.port, l.hostname])).toEqual([
      [4123, 'https://web.local'],
      [4451, undefined],
    ])
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
