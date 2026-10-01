import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Project } from '../scanner'
import { buildRows, classifyRows, type Facts, projectFor } from './groups'
import { type PsRow, parsePs } from './parse'

const ME = 501
const FIXTURE = parsePs(
  readFileSync(new URL('./ps-fixture.txt', import.meta.url), 'latin1')
    .split('\n')
    .slice(1)
    .join('\n'),
)
const NOW = Math.max(...FIXTURE.map((r) => r.started)) + 1_000
const HOME = '/Users/jurrejan'
const LOGS = `${HOME}/dev/.atlas-logs`

const project = (path: string) => ({
  name: path.split('/').pop(),
  slug: path.split('/').pop(),
  path,
})
const PROJECTS = [
  `${HOME}/dev/multi-stack/project-atlas/atlas-api`,
  `${HOME}/dev/web/kunstuitleen-gallery`,
  `${HOME}/dev/multi-stack/snail-mail`,
  `${HOME}/dev/multi-stack/deckhand`,
  `${HOME}/dev/python/gokova-flights`,
].map(project) as Project[]

function facts(over: Partial<Facts> = {}): Facts {
  return {
    now: NOW,
    files: new Map([
      [977, { cwd: `${HOME}/dev/multi-stack/project-atlas/atlas-api` }],
      [
        67570,
        {
          cwd: `${HOME}/dev/web/kunstuitleen-gallery`,
          stdout: `${LOGS}/web-kunstuitleen-gallery.log`,
        },
      ],
      [
        67584,
        {
          cwd: `${HOME}/dev/web/kunstuitleen-gallery`,
          stdout: `${LOGS}/web-kunstuitleen-gallery.log`,
        },
      ],
    ]),
    ports: new Map([
      [977, [47891]],
      [67584, [4123]],
    ]),
    launchd: new Map([
      [977, 'com.jurrejan.atlas-api'],
      [981, 'com.jurrejan.snail-mail'],
      [994, 'com.jurrejan.deckhand'],
      [71489, 'com.jurrejan.pimpelmees-theme-linear-sync'],
    ]),
    sessions: new Map([[25030, 'dusk-shrike']]),
    projects: PROJECTS,
    // ~/Documents/development is a symlink to ~/dev on this Mac
    realDir: (d) => d.replace(`${HOME}/Documents/development/`, `${HOME}/dev/`),
    exists: () => true,
    logDir: LOGS,
    hostnames: new Map([
      [`${HOME}/dev/web/kunstuitleen-gallery`, 'https://web-kunstuitleen-gallery.example'],
    ]),
    ...over,
  }
}

const build = (rows: PsRow[] = FIXTURE, f = facts()) => buildRows(classifyRows(rows, ME), f)
const { rows, processes } = build()
const rowOf = (pgid: number) => rows.find((r) => r.pgid === pgid) ?? expect.fail(`no row ${pgid}`)
const procOf = (pid: number) => processes.find((p) => p.pid === pid) ?? expect.fail(`no pid ${pid}`)

describe('app rows', () => {
  it.each([
    [977, 977],
    [981, 1223],
    [986, 1116],
    [993, 1125],
    [994, 1073], // not the Agent-SDK claude its python spawned
    [25030, 25030],
    [33178, 34392], // leader gone: just → just → shopify theme check
    [34699, 34703], // zsh -c → bun run build → vite build
    [34836, 34836], // Chrome, not the ChatGPT host in its group
    [48223, 48367], // onenv folds into the claude it wraps
    [51367, 51375],
    [61082, 64171],
    [61084, 61225],
    [61101, 61461],
    [61102, 61743],
    [61126, 61126],
    [66184, 66184],
    [67570, 67584], // bun dev → vite
    [72708, 72729], // leader gone, two vite previews: the larger one
    [73159, 73159],
    [94710, 94721], // uv run → python, leader gone
  ])('group %i is named after %i', (pgid, primary) => {
    expect(rowOf(pgid).primary).toBe(primary)
    expect(rowOf(pgid).id).toBe(`${pgid}@${procOf(primary).startedAt}`)
  })

  it('names atlas-api after its project, not `index`, and keeps its children in the row', () => {
    expect(rowOf(977)).toMatchObject({
      name: 'atlas-api',
      kind: 'bun',
      launchd: 'com.jurrejan.atlas-api',
    })
    expect(rowOf(977).pids).toEqual(expect.arrayContaining([977, 75502, 73350]))
    expect(rowOf(977).pids[0]).toBe(977)
  })

  it('sums CPU and RSS over the members, uptime is the oldest', () => {
    const r = rowOf(34699)
    const members = r.pids.map(procOf)
    expect(r.rss).toBe(members.reduce((n, p) => n + p.rss, 0))
    expect(r.cpu).toBeCloseTo(members.reduce((n, p) => n + p.cpu, 0))
    expect(r.uptime).toBe(Math.max(...members.map((p) => p.uptime)))
  })

  it('every process belongs to exactly one row', () => {
    const pids = rows.flatMap((r) => r.pids)
    expect(new Set(pids).size).toBe(pids.length)
    expect(pids.length).toBe(FIXTURE.length)
  })

  it('marks development rows', () => {
    expect(rowOf(67570).dev).toBe(true)
    expect(rowOf(25030).dev).toBe(true)
    expect(rowOf(34836).dev).toBe(false)
    expect(rowOf(1).dev).toBe(false)
    const inProject = facts()
    inProject.files.set(67732, { cwd: `${HOME}/dev/web/kunstuitleen-gallery` })
    const shell = build(FIXTURE, inProject).rows.find((r) => r.pgid === 67732)
    expect(shell?.project?.name).toBe('kunstuitleen-gallery')
    expect(shell?.dev).toBe(false) // a terminal sitting in a project is not development work
  })
})

describe('project attribution', () => {
  it('by cwd first', () =>
    expect(procOf(977)).toMatchObject({ via: 'cwd', project: { name: 'atlas-api' } }))
  it('by a project path in argv (a venv python)', () =>
    expect(procOf(1223)).toMatchObject({ via: 'args', project: { name: 'snail-mail' } }))
  it('by argv through a symlinked folder', () =>
    expect(procOf(61117)).toMatchObject({ via: 'args', project: { name: 'gokova-flights' } }))
  it("by its group's otherwise", () =>
    expect(procOf(34702)).toMatchObject({
      via: 'group',
      project: { name: 'kunstuitleen-gallery' },
    }))
  it('picks the deepest project and not a sibling sharing a prefix', () => {
    const ps = [{ path: '/dev/a' }, { path: '/dev/a/app' }, { path: '/dev/ab' }] as Project[]
    expect(projectFor('/dev/a/app/src', ps)?.path).toBe('/dev/a/app')
    expect(projectFor('/dev/abc', ps)).toBeUndefined()
  })
})

describe('atlas-run servers', () => {
  it('know their log, slug and hostname, and are never orphans', () => {
    expect(rowOf(67570).atlasRun).toEqual({
      log: `${LOGS}/web-kunstuitleen-gallery.log`,
      slug: 'web-kunstuitleen-gallery',
      hostname: 'https://web-kunstuitleen-gallery.example',
    })
    expect(rowOf(67570).flags).not.toContain('orphan')
  })
})

describe('flags', () => {
  it('orphan: a dev server whose parent exited', () => {
    expect(rowOf(46368)).toMatchObject({ flags: ['orphan'], orphanReason: 'parent-exited' })
    expect(rowOf(94710).flags).toContain('orphan')
  })

  it('never an orphan: launchd jobs, apps, deliberate daemons', () => {
    for (const pgid of [977, 981, 994, 970, 1335, 34836])
      expect(rowOf(pgid).flags).not.toContain('orphan')
  })

  it('orphan: a dev server whose folder is gone', () => {
    expect(rowOf(61101).flags).not.toContain('orphan') // no cwd known, parent alive
    const withCwd = facts({ exists: () => false })
    withCwd.files.set(61461, { cwd: '/tmp/deleted' })
    expect(build(FIXTURE, withCwd).rows.find((x) => x.pgid === 61101)?.orphanReason).toBe(
      'folder-gone',
    )
  })

  it('heavy: a build at 100% CPU', () => {
    expect(rowOf(34699)).toMatchObject({ heavyBy: ['cpu'] })
    expect(rowOf(34699).flags).toContain('heavy')
  })

  it('idle: a program up for days without using CPU', () => {
    const later = build(FIXTURE, facts({ now: NOW + 3 * 86_400_000 }))
    expect(later.rows.find((r) => r.pgid === 76593)?.flags).toContain('idle')
    expect(later.rows.find((r) => r.pgid === 977)?.flags).not.toContain('idle') // launchd
  })

  it('duplicate: two vite dev servers on one checkout, but not a worktree build', () => {
    const vite = FIXTURE.find((r) => r.pid === 67584) as PsRow
    const twin = { ...vite, pid: 90001, ppid: 1, pgid: 90001 }
    const f = facts()
    f.files.set(90001, { cwd: `${HOME}/dev/web/kunstuitleen-gallery` })
    const out = build([...FIXTURE, twin], f)
    const [a, b] = [out.rows.find((r) => r.pgid === 67570), out.rows.find((r) => r.pgid === 90001)]
    expect(a?.flags).toContain('duplicate')
    expect(a?.duplicateOf).toEqual([b?.id])
    expect(b?.duplicateOf).toEqual([a?.id])
    expect(out.rows.find((r) => r.pgid === 34699)?.flags).not.toContain('duplicate')
  })

  it('duplicate: never across worktrees of one project', () => {
    const api = FIXTURE.find((r) => r.pid === 977) as PsRow
    const [a, b] = [90004, 90005].map((pid) => ({ ...api, pid, ppid: 1, pgid: pid }))
    const f = facts({ launchd: new Map() })
    f.files.set(90004, { cwd: `${HOME}/dev/multi-stack/project-atlas/atlas-api/.worktrees/w1` })
    f.files.set(90005, { cwd: `${HOME}/dev/multi-stack/project-atlas/atlas-api/.worktrees/w2` })
    f.ports.set(90004, [48111])
    f.ports.set(90005, [48112])
    const out = build([...FIXTURE, a, b], f)
    for (const pgid of [90004, 90005]) {
      const r = out.rows.find((x) => x.pgid === pgid)
      expect(r?.name).toBe('atlas-api') // `index` is no name; the project's is
      expect(r?.flags).not.toContain('duplicate')
    }
  })

  it('sorts flagged rows first', () => {
    const firstClean = rows.findIndex((r) => !r.flags.length)
    expect(rows.slice(firstClean).every((r) => !r.flags.length)).toBe(true)
  })
})

describe('tree rules', () => {
  it("an agent's program child is its MCP server", () => {
    const child = {
      ...(FIXTURE.find((r) => r.pid === 23074) as PsRow),
      pid: 90002,
      ppid: 25030,
      pgid: 25030,
    }
    expect(build([...FIXTURE, child]).processes.find((p) => p.pid === 90002)?.kind).toBe('mcp')
  })

  it('a command its Bash tool started (own group) is not an MCP server', () => {
    const bg = {
      ...(FIXTURE.find((r) => r.pid === 23074) as PsRow),
      pid: 90003,
      ppid: 25030,
      pgid: 90003,
    }
    expect(build([...FIXTURE, bg]).processes.find((p) => p.pid === 90003)?.kind).toBe('bun')
  })

  it('carries the agent session name to the row', () => {
    expect(rowOf(25030).session).toBe('dusk-shrike')
  })
})
