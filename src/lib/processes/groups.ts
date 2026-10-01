/**
 * From classified ps rows to the contract: project attribution, app rows (one process group
 * folded into the process doing the work) and their flags. Pure; `snapshot.ts` does the I/O.
 */
import { basename, dirname } from 'node:path'
import type { Project } from '../scanner'
import { type Classified, classify, RANK, type Role } from './classify'
import { compareRows, flagDuplicates, flagRow } from './flags'
import { type OpenFiles, type PsRow, redact } from './parse'
import { GENERIC } from './shape'
import type { AppRow, ProcessInfo, ProcessProject } from './types'

export type Proc = PsRow & Classified

/** Everything the snapshot read besides ps, keyed by pid. */
export interface Facts {
  now: number
  files: Map<number, OpenFiles>
  ports: Map<number, number[]>
  launchd: Map<number, string>
  sessions: Map<number, string>
  /** This Mac's catalogued projects. */
  projects: Project[]
  /** realpath of a directory (`~/Documents/development` → `~/dev`); identity in tests. */
  realDir: (dir: string) => string
  exists: (path: string) => boolean
  /** `~/dev/.atlas-logs`: a process whose stdout goes there was started by `POST /api/run`. */
  logDir: string
  /** project path → its local dev hostname. */
  hostnames: Map<string, string>
}

/** Roles that make a row a development row; a project attribution does too. */
const DEV_ROLES = new Set<Role>([
  'agent',
  'mcp',
  'dev-server',
  'build',
  'language-server',
  'runner',
  'program',
  'infra',
])
/** A terminal or an app that merely sits in a project folder is not development work. */
const NOT_DEV = new Set<Role>(['shell', 'app', 'system'])
const HOME_PATH = /^\/Users\/[^/]+\//

export const classifyRows = (rows: PsRow[], selfUid: number): Proc[] =>
  rows.map((r) => ({ ...r, ...classify(r, selfUid) }))

/** Pure: the deepest catalogued project containing `path`. */
export function projectFor(path: string | undefined, projects: Project[]): Project | undefined {
  if (!path) return undefined
  let best: Project | undefined
  for (const p of projects) {
    const inside = path === p.path || path.startsWith(`${p.path}/`)
    if (inside && (!best || p.path.length > best.path.length)) best = p
  }
  return best
}

/** cwd first; else the first home path in argv (`<project>/.venv/bin/python`, `--project <dir>`). */
function attribute(p: Proc, f: Facts): { project?: Project; via?: 'cwd' | 'args' } {
  const byCwd = projectFor(f.files.get(p.pid)?.cwd, f.projects)
  if (byCwd) return { project: byCwd, via: 'cwd' }
  for (const raw of p.args.split(/\s+/)) {
    const t = raw.replace(/^file:\/\//, '')
    if (!HOME_PATH.test(t)) continue
    // realpath the directory, never the file: a venv's python resolves out of the project.
    const project = projectFor(t, f.projects) ?? projectFor(f.realDir(dirname(t)), f.projects)
    if (project) return { project, via: 'args' }
  }
  return {}
}

const toProject = ({ name, path, slug }: Project): ProcessProject => ({ name, path, slug })

function toInfo(p: Proc, f: Facts, project: Project | undefined, via?: ProcessInfo['via']) {
  const files = f.files.get(p.pid)
  const log = files?.stdout?.startsWith(`${f.logDir}/`) ? files.stdout : undefined
  const info: ProcessInfo = {
    pid: p.pid,
    ppid: p.ppid,
    pgid: p.pgid,
    uid: p.uid,
    startedAt: p.startedAt,
    kind: p.kind,
    tool: p.tool,
    name: p.name,
    exe: p.exe,
    command: p.argsUnavailable ? '' : redact(p.args),
    argsUnavailable: p.argsUnavailable,
    zombie: p.zombie,
    cpu: p.cpu,
    cpuTime: p.cpuTime,
    rss: p.rss,
    uptime: Math.max(0, Math.round((f.now - p.started) / 1000)),
    cwd: files?.cwd,
    project: project && toProject(project),
    via,
    ports: f.ports.get(p.pid),
    launchd: f.launchd.get(p.pid) ?? f.launchd.get(p.pgid),
    atlasRun: log ? { log } : undefined,
    session: f.sessions.get(p.pid),
  }
  return info
}

/** Lower rank wins, then the larger RSS. */
const best = (procs: Proc[]): Proc =>
  procs.reduce((a, b) => {
    const d = RANK.indexOf(a.role) - RANK.indexOf(b.role)
    return d < 0 || (d === 0 && a.rss >= b.rss) ? a : b
  })

/**
 * Root = the group leader if alive, else the best member whose parent is outside the group.
 * From there, step through wrappers (`uv run` → its python, `bun dev` → vite) to the best child.
 */
export function foldGroup(members: Proc[]): { root: Proc; primary: Proc } {
  const pids = new Set(members.map((m) => m.pid))
  const leader = members.find((m) => m.pid === m.pgid)
  const tops = members.filter((m) => !pids.has(m.ppid))
  const root = leader ?? best(tops.length ? tops : members)
  let primary = root
  while (primary.role === 'runner' || primary.role === 'shell') {
    const kids = members.filter((m) => m.ppid === primary.pid && !m.zombie)
    if (!kids.length) break
    primary = best(kids)
  }
  return { root, primary }
}

/** Members in tree order from the roots, primary first. */
function treeOrder(members: Proc[], primary: Proc): number[] {
  const pids = new Set(members.map((m) => m.pid))
  const order: number[] = [primary.pid]
  const visit = (p: Proc) => {
    if (p !== primary) order.push(p.pid)
    for (const c of members) if (c.ppid === p.pid && c !== p) visit(c)
  }
  for (const top of members.filter((m) => !pids.has(m.ppid) || m.ppid === m.pid)) visit(top)
  return order
}

/** The checkout a dev server serves: its worktree (`.claude/worktrees/<name>`, `.worktrees/<name>`) or its project. */
function checkoutOf(cwd: string | undefined, project: ProcessProject | undefined) {
  const worktree = cwd?.match(/^(.*?\/(?:\.claude\/worktrees|\.?worktrees)\/[^/]+)/)?.[1]
  return worktree ?? project?.path
}

export interface Folded {
  row: AppRow
  root: Proc
  primary: Proc
  checkout?: string
}

function sum(infos: ProcessInfo[], key: 'cpu' | 'cpuTime' | 'rss'): number {
  return infos.reduce((n, p) => n + p[key], 0)
}

function toRow(members: Proc[], infos: Map<number, ProcessInfo>, f: Facts): Folded {
  const { root, primary } = foldGroup(members)
  const main = infos.get(primary.pid) as ProcessInfo
  const all = members.map((m) => infos.get(m.pid) as ProcessInfo)
  const project = main.project
  const generic = GENERIC.test(main.name)
  const log = main.atlasRun?.log ?? all.find((p) => p.atlasRun)?.atlasRun?.log
  const hostname = project && f.hostnames.get(project.path)
  const row: AppRow = {
    id: `${primary.pgid}@${primary.startedAt}`,
    pgid: primary.pgid,
    primary: primary.pid,
    kind: main.kind,
    tool: main.tool,
    name: generic && project ? project.name : main.name,
    project,
    dev: DEV_ROLES.has(primary.role) || Boolean(project && !NOT_DEV.has(primary.role)),
    pids: treeOrder(members, primary),
    cpu: Math.round(sum(all, 'cpu') * 10) / 10,
    cpuTime: Math.round(sum(all, 'cpuTime') * 100) / 100,
    rss: sum(all, 'rss'),
    uptime: Math.max(...all.map((p) => p.uptime)),
    ports: [...new Set(all.flatMap((p) => p.ports ?? []))].sort((a, b) => a - b),
    session: main.session ?? all.find((p) => p.session)?.session,
    launchd: f.launchd.get(primary.pgid) ?? main.launchd,
    atlasRun: log ? { log, slug: basename(log, '.log'), hostname } : undefined,
    flags: [],
  }
  return { row, root, primary, checkout: checkoutOf(main.cwd, project) }
}

/** Attribution per process; a member with none takes its group's project (`via: 'group'`). */
function attributeAll(groups: Proc[][], f: Facts) {
  const found = new Map(groups.flat().map((p) => [p.pid, attribute(p, f)]))
  const byGroup = new Map<number, Project | undefined>()
  for (const members of groups) {
    const { primary } = foldGroup(members)
    // An agent session's stdio MCP servers share its group: where their code lives says
    // nothing about the session's project, so an agent row's project is the agent's own.
    const sources =
      primary.role === 'agent'
        ? [primary]
        : [...members].sort((a, b) => RANK.indexOf(a.role) - RANK.indexOf(b.role))
    byGroup.set(primary.pgid, sources.map((p) => found.get(p.pid)?.project).find(Boolean))
  }
  return (p: Proc) => {
    const own = found.get(p.pid)
    if (own?.project) return own
    const group = byGroup.get(p.pgid)
    return group ? { project: group, via: 'group' as const } : {}
  }
}

/** Rules that need the tree: an agent's program child is its MCP server; a listening one serves. */
function promote(procs: Proc[], f: Facts, projectOf: (p: Proc) => { project?: Project }): void {
  const byPid = new Map(procs.map((p) => [p.pid, p]))
  for (const p of procs) {
    if (p.role !== 'program') continue
    const parent = byPid.get(p.ppid)
    // stdio children share the agent's group; its Bash tool's commands get their own.
    if (parent?.role === 'agent' && parent.pgid === p.pgid) {
      Object.assign(p, { role: 'mcp', kind: 'mcp', tool: p.name })
    } else if (f.ports.has(p.pid) && projectOf(p).project && !f.launchd.get(p.pgid)) {
      p.role = 'dev-server'
    }
  }
}

export function buildRows(procs: Proc[], f: Facts): { processes: ProcessInfo[]; rows: AppRow[] } {
  const groups = new Map<number, Proc[]>()
  for (const p of procs) groups.set(p.pgid, [...(groups.get(p.pgid) ?? []), p])
  const projectOf = attributeAll([...groups.values()], f)
  promote(procs, f, projectOf)
  const infos = new Map<number, ProcessInfo>()
  for (const p of procs) {
    const { project, via } = projectOf(p)
    infos.set(p.pid, toInfo(p, f, project, via))
  }
  const folded = [...groups.values()].map((members) => toRow(members, infos, f))
  for (const row of folded) flagRow(row, f)
  flagDuplicates(folded)
  const rows = folded.map((x) => x.row).sort(compareRows)
  return { processes: [...infos.values()], rows }
}
