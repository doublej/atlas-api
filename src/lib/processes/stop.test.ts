import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type PsRow, parsePs } from './parse'
import { parseStopRequest, planStop } from './stop'

const FIXTURE = parsePs(
  readFileSync(new URL('./ps-fixture.txt', import.meta.url), 'latin1')
    .split('\n')
    .slice(1)
    .join('\n'),
)
const row = (pid: number) => FIXTURE.find((r) => r.pid === pid) as PsRow
const at = (pid: number) => ({ pid, startedAt: row(pid).startedAt })
/** As if atlas-api (977, its own group leader) were asking. */
const SELF = { pid: 977, pgid: 977, uid: 501 }
const JOBS = new Map([
  [977, 'com.jurrejan.atlas-api'],
  [981, 'com.jurrejan.snail-mail'],
  [34836, 'application.com.google.Chrome.123'],
])
const plan = (targets: { pid: number; startedAt: string }[], tree = false, rows = FIXTURE) =>
  planStop(rows, JOBS, { targets, tree }, SELF)

describe('planStop refusals', () => {
  it.each([
    ['pid 1', at(1), 'protected-pid'],
    ['atlas-api itself', at(977), 'atlas-api'],
    ["atlas-api's own children (its group)", at(75502), 'atlas-api'],
    ["another user's process", at(431), 'other-user'],
    ['a launchd job by its group', at(1223), 'launchd-job'],
    ['a GUI app (application.* job)', at(34836), 'launchd-job'],
    ['a zombie', at(34568), 'zombie'],
    ['a reused pid', { pid: 67584, startedAt: '2001-01-01T00:00:00.000Z' }, 'pid-reused'],
  ])('%s', (_, target, refusal) => {
    const { results, wouldEnd } = plan([target])
    expect(results[0]).toMatchObject({ status: 'refused', refusal })
    expect(wouldEnd).toEqual([])
  })

  it('names the launchd label so the caller can restart the job instead', () => {
    expect(plan([at(1223)]).results[0].label).toBe('com.jurrejan.snail-mail')
  })

  it('reports a pid that no longer exists as gone', () => {
    expect(plan([{ pid: 99999, startedAt: 'x' }]).results[0].status).toBe('gone')
  })
})

describe('planStop trees', () => {
  it('pulls in the descendants, parent first, and keeps request order', () => {
    const { results, wouldEnd } = plan([at(61126), at(67570)], true)
    expect(results.map((r) => [r.pid, r.status])).toEqual([
      [61126, 'would-stop'],
      [67570, 'would-stop'],
    ])
    expect(results[0].tree).toEqual([61250, 62577])
    expect(wouldEnd.map((p) => p.pid)).toEqual([61126, 61250, 62577, 67570, 67584])
    expect(wouldEnd[0]).toMatchObject({ kind: 'node', name: 'wrangler' })
  })

  it('puts a parent before its child when the targets arrive child-first', () => {
    const { wouldEnd } = plan([at(62577), at(61250), at(61126)])
    expect(wouldEnd.map((p) => p.pid)).toEqual([61126, 61250, 62577])
  })

  it('without tree, only the target', () => {
    expect(plan([at(67570)]).wouldEnd.map((p) => p.pid)).toEqual([67570])
  })

  it('skips a refused member with its subtree and says why', () => {
    const parent = { ...row(61126), pid: 90010, ppid: 1, pgid: 90010 }
    const zombie = { ...row(34568), pid: 90011, ppid: 90010, pgid: 90010 }
    const rootChild = { ...row(538), pid: 90012, ppid: 90010, pgid: 90010 }
    const grandchild = { ...row(61250), pid: 90013, ppid: 90012, pgid: 90010 }
    const rows = [...FIXTURE, parent, zombie, rootChild, grandchild]
    const out = plan([{ pid: 90010, startedAt: parent.startedAt }], true, rows)
    expect(out.wouldEnd.map((p) => p.pid)).toEqual([90010])
    expect(out.skipped.map((s) => [s.pid, s.refusal])).toEqual([
      [90011, 'zombie'],
      [90012, 'other-user'],
    ])
  })

  it('redacts the commands it lists', () => {
    const secret = {
      ...row(66265),
      pid: 90020,
      ppid: 1,
      pgid: 90020,
      args: 'node x --token hunter22',
    }
    const out = plan([{ pid: 90020, startedAt: secret.startedAt }], false, [...FIXTURE, secret])
    expect(JSON.stringify(out)).not.toContain('hunter22')
  })
})

describe('parseStopRequest', () => {
  it('accepts a well-formed body and defaults the flags to false', () => {
    expect(parseStopRequest({ targets: [{ pid: 5, startedAt: 'x' }], force: true })).toEqual({
      targets: [{ pid: 5, startedAt: 'x' }],
      tree: false,
      force: true,
      dryRun: false,
    })
  })

  it.each([
    [null],
    [{}],
    [{ targets: [] }],
    [{ targets: [{ pid: 'x', startedAt: 'y' }] }],
    [{ targets: [{ pid: 5 }] }],
    [{ targets: [{ pid: 5, startedAt: 'x' }], tree: 'yes' }],
    [{ targets: Array.from({ length: 201 }, () => ({ pid: 5, startedAt: 'x' })) }],
  ])('rejects %j', (body) => expect(typeof parseStopRequest(body)).toBe('string'))
})
