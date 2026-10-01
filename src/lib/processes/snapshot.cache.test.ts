import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Done = (error: Error | null, stdout: string) => void
/** What the next runs print, in order. `null`: killed at the timeout. Anything else prints nothing. */
const next = vi.hoisted(() => ({
  ps: [] as ((done: Done) => void)[],
  lsof: [] as (string | null)[],
  sessions: [] as (string | null)[],
}))

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFile: (cmd: string, _args: string[], _opts: unknown, done: Done) => {
    if (cmd === '/bin/ps') return (next.ps.shift() ?? ((d: Done) => d(null, '')))(done)
    const out = cmd === '/usr/sbin/lsof' ? next.lsof.shift() : ''
    if (out === null) done(Object.assign(new Error('timed out'), { killed: true }), '')
    else done(null, out ?? '')
  },
  // `ps -E`, the session names.
  spawn: () => {
    const out = next.sessions.shift()
    const stdout = new PassThrough()
    const child = Object.assign(new EventEmitter(), { stdout, kill() {} })
    const [code, signal] = out === null ? [null, 'SIGKILL'] : [0, null]
    stdout.on('end', () => setImmediate(() => child.emit('close', code, signal)))
    stdout.end(out ?? '')
    return child
  },
}))
vi.mock('../ports', () => ({ listSockets: async () => [] }))
vi.mock('../scanner', () => ({ scan: async () => ({ projects: [] }) }))
vi.mock('../caddyDev', () => ({ listHostnames: async () => [] }))

const PID = 4242
const uid = process.getuid?.() ?? 0
const PS = ` ${PID}     1  ${PID}   ${uid}   1000   0.0   0:00.10 Thu Oct  1 10:51:52 2026     ${'node'.padEnd(16)} node /tmp/srv.js\n`

/** A fresh module each test: the snapshot caches live at module level. */
async function load() {
  vi.resetModules()
  return import('./snapshot')
}

beforeEach(() => {
  next.ps = []
  next.lsof = []
  next.sessions = []
})

describe('snapshot caches', () => {
  it('asks lsof and ps -E again after a read that timed out', async () => {
    const { getSnapshot } = await load()
    next.ps = [(d) => d(null, PS), (d) => d(null, PS)]
    next.lsof = [null, `p${PID}\nfcwd\nn/tmp/proj\n`]
    next.sessions = [null, `${PID} node /tmp/srv.js CLD_SESSION_NAME=velvet-numbat\n`]
    expect((await getSnapshot(true)).byPid.get(PID)?.cwd).toBeUndefined()
    const info = (await getSnapshot(true)).byPid.get(PID)
    expect(info).toMatchObject({ cwd: '/tmp/proj', session: 'velvet-numbat' })
  })

  it('after a stop, a fresh read never joins a build that saw the stopped process', async () => {
    const { getSnapshot, invalidateSnapshot } = await load()
    let release: () => void = () => {}
    next.ps = [
      (d) => {
        release = () => d(null, PS)
      },
      (d) => d(null, ''),
    ]
    const poll = getSnapshot() // the page's poll: its ps still lists PID
    invalidateSnapshot() // PID was stopped meanwhile
    const after = getSnapshot(true)
    release()
    expect((await after).byPid.has(PID)).toBe(false)
    expect((await poll).byPid.has(PID)).toBe(true)
    expect((await getSnapshot()).byPid.has(PID)).toBe(false) // nor did the poll fill the cache
  })
})
