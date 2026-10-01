import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { classify, type Role } from './classify'
import { parsePs } from './parse'

/** Real rows from this Mac (secrets and the one LAN address replaced). Line 1 is the ps command. */
const FIXTURE = parsePs(
  readFileSync(new URL('./ps-fixture.txt', import.meta.url), 'latin1')
    .split('\n')
    .slice(1)
    .join('\n'),
)
const ME = 501
const byPid = new Map(FIXTURE.map((r) => [r.pid, r]))
const of = (pid: number) => classify(byPid.get(pid) ?? expect.fail(`no fixture row ${pid}`), ME)

/** The role every fixture row should get (processes.md §2, checked by hand). */
const ROLES: Record<Role, number[]> = {
  agent: [73102, 49106, 1775, 25701, 48367, 25030, 66184, 19653, 73159],
  mcp: [28684, 28698, 28686, 66263, 66265, 66285, 73242, 73244, 73275],
  'dev-server': [67584, 1223, 1364, 48894, 72729, 72732, 61116, 61117, 61126, 61250, 61907],
  build: [34703, 34392, 61265, 61289, 61225, 61099, 61427, 61513, 61524, 61526, 62577],
  'language-server': [61090, 61100, 61104, 61269, 61579],
  runner: [
    67570, 981, 986, 993, 994, 48223, 28685, 66264, 73243, 34699, 34702, 33195, 34365, 51367, 51375,
    94714, 61082, 61084, 61101, 61102, 61522,
  ],
  program: [
    977, 1116, 1125, 74329, 1073, 35032, 34568, 94721, 76593, 75718, 77211, 23074, 61081, 61743,
    61461, 64171,
  ],
  infra: [],
  tool: [73350, 75800, 51980, 72222, 1337, 27009, 95305, 71835, 63745, 69902],
  shell: [75502, 67732, 23798],
  app: [1288, 1349, 1372, 1445, 786, 26210, 34836, 11387, 56371, 94676, 94813],
  system: [1, 358, 427, 647, 361, 431, 597, 65258, 538, 67730],
  other: [],
}

describe('parsePs', () => {
  it('parses every fixture row, negative uids and argless rows included', () => {
    expect(FIXTURE).toHaveLength(116)
    expect(byPid.get(427)).toMatchObject({ uid: -2, exe: 'dhcp6d' })
    expect(byPid.get(75502)).toMatchObject({ exe: 'bash', args: '(bash)', argsUnavailable: true })
    expect(byPid.get(73350)).toMatchObject({ zombie: true, rss: 0 })
    expect(byPid.get(977)).toMatchObject({ rss: 62928 * 1024, cpu: 2.2, cpuTime: 667.88 })
    expect(byPid.get(26210)?.args).toBe('Raycast Backend') // retitle padding trimmed
    expect(byPid.get(1445)?.exe).toBe('Creative Cloud C') // ucomm keeps its spaces
  })
})

describe('classify: every fixture row has its role', () => {
  const cases = Object.entries(ROLES).flatMap(([role, pids]) => pids.map((pid) => [pid, role]))
  it('covers the whole fixture', () => expect(cases).toHaveLength(FIXTURE.length))
  it.each(cases)('%i is %s', (pid, role) => expect(of(Number(pid)).role).toBe(role))
})

describe('classify: kinds, names and tools', () => {
  it.each([
    [977, 'bun', 'index', undefined], // atlas-api: `bun build/index.js`, named by its project later
    [48223, 'node', 'onenv', 'onenv'], // onenv runs on node
    [1445, 'app', 'CCXProcess', undefined], // `….node` is an Adobe binary, not node
    [67584, 'node', 'vite', 'vite'],
    [61250, 'node', 'wrangler', 'wrangler'],
    [61101, 'node', 'tsx', 'tsx'],
    [61102, 'node', 'npm', 'npm'],
    [61116, 'python', 'uvicorn', 'uvicorn'],
    [61117, 'python', 'jupyter', 'jupyter'],
    [61907, 'python', 'jupyter', 'jupyter'],
    [981, 'uv', 'uv', undefined],
    [1223, 'python', 'snail-mail', undefined],
    [28684, 'mcp', 'Consult User MCP', 'Consult User MCP'],
    [28698, 'mcp', 'deckhand-mcp', 'deckhand-mcp'],
    [66265, 'mcp', 'mcp-remote', 'mcp-remote'],
    [61090, 'language-server', 'tsserver', 'tsserver'],
    [61269, 'language-server', 'pyright', 'pyright'],
    [61100, 'language-server', 'rust-analyzer', 'rust-analyzer'],
    [25701, 'claude', 'claude', undefined],
    [73102, 'claude', 'claude', undefined],
    [1775, 'codex', 'codex', undefined],
    [72222, 'beads', 'bd', undefined],
    [61084, 'cargo', 'cargo', undefined],
    [61225, 'rustc', 'rustc', undefined],
    [61082, 'go', 'go', undefined],
    [61265, 'go', 'compile', undefined],
    [64171, 'go', 'main', undefined],
    [61081, 'deno', 'deno', undefined],
    [61522, 'shell', 'sh', undefined], // `sh -c` is bash under the hood (ucomm)
    [26210, 'app', 'Raycast Backend', undefined],
    [34836, 'app', 'Google Chrome', undefined],
    [76593, 'python', 'preview_server', undefined],
    [431, 'system', 'WindowServer', undefined],
  ])('%i → %s %s', (pid, kind, name, tool) => {
    expect(of(pid)).toMatchObject({ kind, name })
    expect(of(pid).tool).toBe(tool)
  })

  it('finds the app bundle of a binary whose name has spaces and is clipped', () => {
    const args =
      '/Users/x/Library/Caches/ms-playwright/chromium-1/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --user-data-dir=/Users/x/dev/web/a/.pw'
    expect(classify({ exe: 'Google Chrome fo', args, uid: ME }, ME)).toMatchObject({
      kind: 'app',
      name: 'Google Chrome for Testing',
    })
  })

  it('reads an ssh multiplexer (`ssh: <socket> [mux]`) as ssh', () => {
    const row = { exe: 'ssh', args: 'ssh: /Users/x/.ssh/cm-nas [mux]', uid: ME }
    expect(classify(row, ME)).toMatchObject({ role: 'tool', name: 'ssh' })
  })

  it('reads an argless "(Python)" row by its kernel name alone', () => {
    const row = { exe: 'Python', args: '(Python)', uid: ME, argsUnavailable: true as const }
    expect(classify(row, ME)).toMatchObject({ kind: 'python', role: 'program', name: 'Python' })
  })
})

/** SYNTHETIC — kinds that had no live process on this Mac when the fixture was taken. */
describe('classify: synthetic rows for kinds absent from the fixture', () => {
  const row = (exe: string, args: string) => classify({ exe, args, uid: ME }, ME)
  it.each([
    [
      'com.docker.backe',
      '/Applications/Docker.app/Contents/MacOS/com.docker.backend',
      'docker',
      'infra',
    ],
    ['dockerd', '/usr/local/bin/dockerd --host unix:///var/run/docker.sock', 'docker', 'infra'],
    ['caddy', '/opt/homebrew/bin/caddy run --config /opt/homebrew/etc/Caddyfile', 'caddy', 'infra'],
    ['ollama', '/Applications/Ollama.app/Contents/Resources/ollama serve', 'ollama', 'infra'],
    ['dolt', 'dolt sql-server --host 127.0.0.1 --port 3307', 'dolt', 'infra'],
    ['gopls', '/Users/x/go/bin/gopls -mode=stdio', 'language-server', 'language-server'],
    [
      'node',
      'node /Users/x/.vscode/extensions/svelte.svelte-vscode/node_modules/svelte-language-server/bin/server.js --stdio',
      'language-server',
      'language-server',
    ],
    [
      'node',
      'node /Users/x/dev/web/shop/node_modules/.bin/next dev --port 4300',
      'node',
      'dev-server',
    ],
    ['node', 'next-server (v15.1.0)', 'node', 'dev-server'],
  ])('%s: %s → %s', (exe, args, kind, role) => {
    expect(row(exe, args)).toMatchObject({ kind, role })
  })

  it('names next by its tool, not by its retitled process', () => {
    expect(row('node', 'next-server (v15.1.0)')).toMatchObject({ name: 'next', tool: 'next' })
  })
})
