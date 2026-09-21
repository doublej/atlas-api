import { exec } from 'node:child_process'
import type { Dirent, Stats } from 'node:fs'
import { open, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
// Relative, not the `$shared` alias: this module also runs standalone (`bun run scan`) and is
// bundled for remote hosts, where SvelteKit's aliases do not exist.
import { getHosts, getPrimaryHost } from '../../../shared/hosts'
import {
  type AtlasConfig,
  DEFAULT_CONFIG,
  depthLimit,
  isIgnored,
  patchAtlas,
  readAtlas,
  readConfig,
} from './atlasFile'
import { estimateTokens } from './claude-tree'
import { detectDomains, mergeDomains } from './domains'
import { attachUmami, type UmamiInfo } from './umami'

const execAsync = promisify(exec)

const IGNORE = new Set([
  '.DS_Store',
  '.git',
  'node_modules',
  '.TemporaryItems',
  'dist',
  'build',
  '.svelte-kit',
  '__pycache__',
  '.venv',
  'venv',
  '.cache',
  '.beads',
])

export type Framework =
  | 'sveltekit'
  | 'svelte'
  | 'next'
  | 'nuxt'
  | 'astro'
  | 'remix'
  | 'vite'
  | 'react'
  | 'vue'
  | 'angular'
  | 'express'
  | 'fastify'
  | 'hono'
  | 'elysia'
  | 'fastapi'
  | 'flask'
  | 'django'
  | 'streamlit'
  | 'tauri'
  | 'electron'
  | 'vapor'
  | 'unknown'

export type GitStatus = 'clean' | 'dirty' | 'no-repo' | 'error'

/**
 * Branch-flow policy. Derived per repo unless `.atlas` declares one.
 * - `gitflow`  — feature/* → develop → trunk → tag. Opted in (has a develop branch).
 * - `trunk`    — own repo, single line of work. The default for most projects.
 * - `external` — clone of someone else's repo. Never flagged, never migrated.
 * - `local`    — no remote. Scratch/local-only, no flow to enforce.
 */
export type FlowPolicy = 'gitflow' | 'trunk' | 'external' | 'local'

export interface GitFlow {
  policy: FlowPolicy
  /** The main branch of this repo — `main`, `master`, or whatever `.atlas` declares. */
  trunk: string
  /** The integration branch, when the repo has one. */
  integration?: string
  /** Owner of the main repository (origin), e.g. `doublej`. */
  owner?: string
  /** One-line reason the current branch is off-flow. Only set under `gitflow`. */
  drift?: string
}
export type DeployPlatform = 'vercel' | 'render' | 'netlify' | 'docker' | 'github-actions'

export interface DeployInfo {
  platform: DeployPlatform
  url?: string
}

export interface BeadsInfo {
  open: number
  inProgress: number
  closed: number
}

export interface ClaudeSessionsInfo {
  lastAt: string
  count: number
  summary?: string
}

export interface AgentFilesInfo {
  claude?: { tokens: number }
  agents?: { tokens: number }
}

/**
 * How a project is set up for Claude Code: the MCP servers it declares and what its
 * `.claude/` directory carries. Counts, not contents — the claude-tree view is where
 * the files themselves are read.
 */
export interface ClaudeSetupInfo {
  /** Every MCP server scoped to this project: its `.mcp.json` plus user-added ones. */
  mcpServers?: string[]
  /** The subset of `mcpServers` switched off for this project. */
  mcpDisabled?: string[]
  agents?: number
  commands?: number
  skills?: number
  rules?: number
  /** Hook events wired in `.claude/settings.json` / `settings.local.json`. */
  hooks?: string[]
  /** `.claude/settings.json` (shared) and/or `settings.local.json` (personal) exist. */
  settings?: ('shared' | 'local')[]
}

export interface PromotionStatus {
  status: 'none' | 'draft' | 'in-progress' | 'ready' | 'published'
  platforms: Record<string, string>
  vaultPath?: string
}

/** The same project, catalogued on another machine. Derived at merge time, never scanned. */
export interface HostLink {
  host: string
  path: string
}

export interface Project {
  name: string
  slug: string
  path: string
  relativePath: string
  /** Which machine this project lives on — a `hosts.json` id. */
  host: string
  /**
   * Present (and `true`) only on the primary host's own projects. Every action that touches
   * a filesystem or a GUI is gated on it, so the flag's *absence* is what keeps writes local.
   */
  isLocal?: boolean
  /** The same project name found on another host. Only set when the name is unambiguous here. */
  alsoOn?: HostLink[]
  description?: string
  readme?: string
  type?: string
  framework?: Framework
  modifiedAt: string
  scripts?: Record<string, string>
  devCommand?: string
  runner?: 'bun' | 'npm' | 'yarn' | 'pnpm' | 'uv'
  git?: GitStatus
  gitBranch?: string
  flow?: GitFlow
  hasJustfile?: boolean
  justRecipes?: string[]
  deploy?: DeployInfo[]
  beads?: BeadsInfo
  promotion?: PromotionStatus
  archived?: boolean
  port?: number
  /** `.atlas` override: this project's `atlas.remote` dev hostname needs no password. */
  devPublic?: boolean
  domains?: string[]
  umami?: UmamiInfo
  claudeSessions?: ClaudeSessionsInfo
  agentFiles?: AgentFilesInfo
  claudeSetup?: ClaudeSetupInfo
  template?: TemplateInfo
}

export interface TemplateInfo {
  name: string
  version: string
}

export type { UmamiInfo }

/** Per-host outcome of the last scan, so a short catalog reads as "ubuntu down", not "gone". */
export interface HostState {
  id: string
  root: string
  scannedAt: string
  status: 'ok' | 'unreachable' | 'error'
  error?: string
  projectCount: number
}

export interface ProjectAtlas {
  baseDir: string
  scannedAt: string
  projects: Project[]
  frameworks: Framework[]
  folders: string[]
  /** Only present on the primary root's atlas, where remote fragments are merged in. */
  hosts?: HostState[]
}

/**
 * kebab-case a string for use as a DNS label (dev hostnames). The default slug is derived
 * from a project's `relativePath`, not its bare folder name — two projects named `frontend`
 * in different categories would otherwise collide on the same hostname and silently steal
 * each other's Caddy route. Same known ambiguity as `claudeSessionDir`: `web/a-b` and
 * `web-a/b` collapse to the same slug; rare enough in practice not to solve here.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function detectRunner(fullPath: string): Promise<Project['runner'] | undefined> {
  const checks: [string, Project['runner']][] = [
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['yarn.lock', 'yarn'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['package-lock.json', 'npm'],
    ['uv.lock', 'uv'],
  ]

  for (const [file, runner] of checks) {
    try {
      await stat(join(fullPath, file))
      return runner
    } catch {
      /* not found */
    }
  }
  return undefined
}

async function detectJustfile(
  fullPath: string,
): Promise<{ hasJustfile: boolean; recipes: string[] }> {
  const names = ['justfile', 'Justfile', '.justfile']
  for (const filename of names) {
    try {
      const content = await readFile(join(fullPath, filename), 'utf-8')
      const recipePattern = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*[^:]*:/gm
      const recipes: string[] = []
      let match
      while ((match = recipePattern.exec(content)) !== null) {
        if (!match[1].startsWith('_')) recipes.push(match[1])
      }
      return { hasJustfile: true, recipes }
    } catch {
      /* not found */
    }
  }
  return { hasJustfile: false, recipes: [] }
}

async function detectPromotion(
  projectName: string,
  baseDir: string,
): Promise<PromotionStatus | undefined> {
  const vaultIndex = join(
    baseDir,
    '_management',
    'promotion-vault',
    'projects',
    projectName,
    'index.md',
  )
  try {
    const raw = await readFile(vaultIndex, 'utf-8')
    // Parse YAML frontmatter manually (avoid importing gray-matter in scanner)
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/)
    if (!fmMatch) return undefined

    const fm = fmMatch[1]
    const statusMatch = fm.match(/^status:\s*(.+)$/m)
    const status = (statusMatch?.[1]?.trim() ?? 'draft') as PromotionStatus['status']

    const platforms: Record<string, string> = {}
    const platformBlock = fm.match(/^platforms:\n((?:\s+\w+:.*\n?)*)/m)
    if (platformBlock) {
      const lines = platformBlock[1].split('\n')
      for (const line of lines) {
        const m = line.match(/^\s+(\w+):\s*\{?\s*status:\s*(\w+)/)
        if (m) platforms[m[1]] = m[2]
      }
    }

    return {
      status,
      platforms,
      vaultPath: `_management/promotion-vault/projects/${projectName}`,
    }
  } catch {
    return undefined
  }
}

async function detectDeploy(fullPath: string): Promise<DeployInfo[]> {
  const results: DeployInfo[] = []

  const checks = await Promise.allSettled([
    stat(join(fullPath, 'vercel.json')).then(() => 'vercel-json' as const),
    stat(join(fullPath, '.vercel', 'project.json')).then(() => 'vercel-dir' as const),
    stat(join(fullPath, 'render.yaml')).then(() => 'render' as const),
    stat(join(fullPath, 'netlify.toml')).then(() => 'netlify' as const),
    stat(join(fullPath, 'Dockerfile')).then(() => 'docker' as const),
    stat(join(fullPath, '.github', 'workflows')).then(() => 'github-actions' as const),
  ])

  const found = new Set(
    checks
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<string>).value),
  )

  if (found.has('vercel-json') || found.has('vercel-dir')) {
    const entry: DeployInfo = { platform: 'vercel' }
    if (found.has('vercel-dir')) {
      try {
        const raw = JSON.parse(await readFile(join(fullPath, '.vercel', 'project.json'), 'utf-8'))
        if (raw.projectId) entry.url = `https://vercel.com/~/projects/${raw.projectId}`
      } catch {
        /* ignore */
      }
    }
    results.push(entry)
  }

  if (found.has('render')) {
    const entry: DeployInfo = { platform: 'render' }
    try {
      const content = await readFile(join(fullPath, 'render.yaml'), 'utf-8')
      const urlMatch = content.match(/ORIGIN\s*:\s*["']?(https?:\/\/[^\s"']+)/)
      if (urlMatch) entry.url = urlMatch[1]
    } catch {
      /* ignore */
    }
    results.push(entry)
  }

  if (found.has('netlify')) results.push({ platform: 'netlify' })
  if (found.has('docker')) results.push({ platform: 'docker' })
  if (found.has('github-actions')) results.push({ platform: 'github-actions' })

  return results
}

async function detectBeads(fullPath: string): Promise<BeadsInfo | undefined> {
  let raw: string
  try {
    raw = await readFile(join(fullPath, '.beads', 'issues.jsonl'), 'utf-8')
  } catch {
    return undefined
  }

  const counts: BeadsInfo = { open: 0, inProgress: 0, closed: 0 }
  for (const line of raw.split('\n')) {
    if (!line) continue
    try {
      const { status } = JSON.parse(line)
      if (status === 'open') counts.open++
      else if (status === 'in_progress') counts.inProgress++
      else if (status === 'closed') counts.closed++
    } catch {
      /* malformed line */
    }
  }
  return counts
}

async function detectTemplate(fullPath: string): Promise<TemplateInfo | undefined> {
  let raw: string
  try {
    raw = await readFile(join(fullPath, '.template-meta.json'), 'utf-8')
  } catch {
    return undefined
  }
  try {
    const meta = JSON.parse(raw)
    if (typeof meta.template !== 'string' || typeof meta.template_version !== 'string') {
      return undefined
    }
    return { name: meta.template, version: meta.template_version }
  } catch {
    return undefined
  }
}

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects')

/**
 * Claude Code encodes a project path as its session folder name by replacing every
 * non-alphanumeric byte with '-'. Known ambiguity: `/a/b-c` and `/a/b/c` collide.
 */
function claudeSessionDir(projectPath: string): string {
  return join(CLAUDE_PROJECTS_DIR, projectPath.replace(/[^a-zA-Z0-9]/g, '-'))
}

async function detectClaudeSessions(fullPath: string): Promise<ClaudeSessionsInfo | undefined> {
  const dir = claudeSessionDir(fullPath)
  let entries: Dirent[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
  const files = entries.filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
  if (files.length === 0) return undefined

  let lastAt = 0
  let newest = ''
  for (const file of files) {
    try {
      const stats = await stat(join(dir, file.name))
      if (stats.mtimeMs > lastAt) {
        lastAt = stats.mtimeMs
        newest = join(dir, file.name)
      }
    } catch {
      /* vanished mid-scan */
    }
  }
  if (lastAt === 0) return undefined

  const info: ClaudeSessionsInfo = { lastAt: new Date(lastAt).toISOString(), count: files.length }
  const summary = await detectSessionSummary(newest)
  if (summary) info.summary = summary
  return info
}

const SUMMARY_TAIL_BYTES = 64 * 1024

/**
 * Last-session gist from the tail of the newest transcript, scanned newest-first:
 * a `summary` line (older transcript format), else the generated `ai-title`, else
 * the last assistant text. Best-effort — undefined on any failure.
 */
async function detectSessionSummary(file: string): Promise<string | undefined> {
  let lines: string[]
  try {
    const fh = await open(file, 'r')
    try {
      const { size } = await fh.stat()
      const start = Math.max(0, size - SUMMARY_TAIL_BYTES)
      const buf = Buffer.alloc(size - start)
      await fh.read(buf, 0, buf.length, start)
      lines = buf.toString('utf-8').split('\n')
      if (start > 0) lines.shift() // first line may be cut mid-record
    } finally {
      await fh.close()
    }
  } catch {
    return undefined
  }

  let title: string | undefined
  let assistant: string | undefined
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line) continue
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (parsed.type === 'summary' && typeof parsed.summary === 'string') return parsed.summary
    if (!title && parsed.type === 'ai-title' && typeof parsed.aiTitle === 'string') {
      title = parsed.aiTitle
    }
    if (!assistant && parsed.type === 'assistant') {
      const content = (parsed.message as { content?: unknown } | undefined)?.content
      if (Array.isArray(content)) {
        const block = content.find((b) => (b as { type?: string }).type === 'text') as
          | { text?: string }
          | undefined
        const text = block?.text?.replace(/\s+/g, ' ').trim()
        if (text) assistant = text.slice(0, 120)
      }
    }
  }
  return title ?? assistant
}

async function detectAgentFiles(fullPath: string): Promise<AgentFilesInfo | undefined> {
  const info: AgentFilesInfo = {}
  try {
    info.claude = { tokens: estimateTokens(await readFile(join(fullPath, 'CLAUDE.md'), 'utf-8')) }
  } catch {
    /* no CLAUDE.md */
  }
  try {
    info.agents = { tokens: estimateTokens(await readFile(join(fullPath, 'AGENTS.md'), 'utf-8')) }
  } catch {
    /* no AGENTS.md */
  }
  return info.claude || info.agents ? info : undefined
}

/** Entries that are not an extension: dotfiles, and the editor droppings next to them. */
const countEntries = async (dir: string): Promise<number> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => !e.name.startsWith('.')).length
  } catch {
    return 0
  }
}

const readJson = async (path: string): Promise<Record<string, unknown> | undefined> => {
  try {
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return undefined // absent, or hand-edited into invalid JSON — same outcome here
  }
}

const names = (v: unknown): string[] =>
  v && typeof v === 'object' ? Object.keys(v as Record<string, unknown>) : []

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/**
 * `~/.claude.json` keeps per-project MCP state (servers added with `claude mcp add`, and
 * which servers are switched off) under the project's absolute path. It is ~1.4 MB, so it
 * is read once and cached for the length of a scan rather than per project.
 */
const USER_CLAUDE_CONFIG = join(homedir(), '.claude.json')
const USER_CONFIG_TTL_MS = 60_000
let userConfigAt = 0
let userConfig: Promise<Record<string, Record<string, unknown>>> | undefined

async function userClaudeEntry(fullPath: string): Promise<Record<string, unknown> | undefined> {
  if (!userConfig || Date.now() - userConfigAt > USER_CONFIG_TTL_MS) {
    userConfigAt = Date.now()
    userConfig = readJson(USER_CLAUDE_CONFIG).then(
      (cfg) => (cfg?.projects as Record<string, Record<string, unknown>>) ?? {},
    )
  }
  return (await userConfig)[fullPath]
}

/**
 * What Claude Code sees when it opens this project: `.mcp.json` servers, the `.claude/`
 * extensions, and which settings files exist. Cheap by design — four readdirs and three
 * small JSON reads, run for every project on every scan.
 */
async function detectClaudeSetup(fullPath: string): Promise<ClaudeSetupInfo | undefined> {
  const dir = join(fullPath, '.claude')
  const [mcp, shared, local, userEntry, agents, commands, skills, rules] = await Promise.all([
    readJson(join(fullPath, '.mcp.json')),
    readJson(join(dir, 'settings.json')),
    readJson(join(dir, 'settings.local.json')),
    userClaudeEntry(fullPath),
    countEntries(join(dir, 'agents')),
    countEntries(join(dir, 'commands')),
    countEntries(join(dir, 'skills')),
    countEntries(join(dir, 'rules')),
  ])

  const info: ClaudeSetupInfo = {}
  // `.mcp.json` is the committed half; `claude mcp add` writes the other half into the
  // user's own config, and a project that only has those still has those servers.
  const mcpServers = [...new Set([...names(mcp?.mcpServers), ...names(userEntry?.mcpServers)])]
  if (mcpServers.length > 0) info.mcpServers = mcpServers

  // Only an explicit "off" counts. Approval state for an un-run project is not written
  // anywhere, so inferring it from an empty enable-list would call every server disabled.
  const off = new Set([
    ...strings(userEntry?.disabledMcpServers),
    ...strings(userEntry?.disabledMcpjsonServers),
    ...strings(shared?.disabledMcpjsonServers),
    ...strings(local?.disabledMcpjsonServers),
  ])
  const disabled = mcpServers.filter((n) => off.has(n))
  if (disabled.length > 0) info.mcpDisabled = disabled

  if (agents > 0) info.agents = agents
  if (commands > 0) info.commands = commands
  if (skills > 0) info.skills = skills
  if (rules > 0) info.rules = rules

  const hooks = [...new Set([...names(shared?.hooks), ...names(local?.hooks)])]
  if (hooks.length > 0) info.hooks = hooks

  const settings: ('shared' | 'local')[] = []
  if (shared) settings.push('shared')
  if (local) settings.push('local')
  if (settings.length > 0) info.settings = settings

  return Object.keys(info).length > 0 ? info : undefined
}

/** Owner of the "main repository" — repos under another owner are clones, not ours. */
const GIT_OWNER = process.env.ATLAS_GIT_OWNER ?? 'doublej'

/** One spawn per repo: branch, flow refs, origin url and dirty state, `---`-separated. */
const GIT_PROBE = [
  'git rev-parse --abbrev-ref HEAD',
  'echo ---',
  "git for-each-ref --format='%(refname:short)' refs/heads/develop refs/heads/main refs/heads/master",
  'echo ---',
  'git config --get remote.origin.url',
  'echo ---',
  'git status --porcelain',
].join('; ')

/** `git@github.com:doublej/x.git` / `https://github.com/doublej/x` → `doublej`. */
function parseRemoteOwner(url: string): string | undefined {
  return /[:/]([^/:]+)\/[^/]+?(?:\.git)?\/?$/.exec(url.trim())?.[1]
}

function buildFlow(
  refs: string[],
  remoteUrl: string,
  branch: string,
  meta: Partial<GitFlow> | undefined,
): GitFlow {
  const trunk =
    meta?.trunk ?? (refs.includes('main') ? 'main' : refs.includes('master') ? 'master' : branch)
  const integration = meta?.integration ?? (refs.includes('develop') ? 'develop' : undefined)
  const owner = remoteUrl ? parseRemoteOwner(remoteUrl) : undefined
  const policy: FlowPolicy =
    meta?.policy ??
    (!remoteUrl ? 'local' : owner !== GIT_OWNER ? 'external' : integration ? 'gitflow' : 'trunk')

  const flow: GitFlow = { policy, trunk }
  if (integration) flow.integration = integration
  if (owner) flow.owner = owner

  // Drift is only meaningful once a repo has opted into the flow.
  if (policy === 'gitflow') {
    if (!integration) flow.drift = 'no develop branch'
    else if (branch !== trunk && branch !== integration && !branch.startsWith('feature/'))
      flow.drift = `${branch} is not feature/*`
  }
  return flow
}

async function detectGitStatus(
  fullPath: string,
): Promise<{ status: GitStatus; branch?: string; flow?: GitFlow }> {
  try {
    await stat(join(fullPath, '.git'))
  } catch {
    return { status: 'no-repo' }
  }

  try {
    const { stdout } = await execAsync(GIT_PROBE, { cwd: fullPath })
    // Split on the marker line, not '\n---\n' — an empty section would swallow a separator.
    const [branchOut = '', refsOut = '', remoteOut = '', statusOut = ''] = stdout.split(/^---$/m)
    const branch = branchOut.trim()
    if (!branch) return { status: 'error' }

    const status: GitStatus = statusOut.trim() === '' ? 'clean' : 'dirty'
    const refs = refsOut.trim().split('\n').filter(Boolean)
    const meta = await readAtlasFlow(fullPath)

    return { status, branch, flow: buildFlow(refs, remoteOut.trim(), branch, meta) }
  } catch {
    return { status: 'error' }
  }
}

/** The `flow` block of `.atlas`, when the project declares one. */
async function readAtlasFlow(fullPath: string): Promise<Partial<GitFlow> | undefined> {
  try {
    const meta = JSON.parse(await readFile(join(fullPath, '.atlas'), 'utf-8'))
    return typeof meta.flow === 'object' && meta.flow ? meta.flow : undefined
  } catch {
    return undefined
  }
}

function detectFrameworkFromPkg(pkg: Record<string, unknown>): Framework {
  const deps = {
    ...(pkg.dependencies as Record<string, string>),
    ...(pkg.devDependencies as Record<string, string>),
  }

  if (deps['@sveltejs/kit']) return 'sveltekit'
  if (deps['svelte']) return 'svelte'
  if (deps['next']) return 'next'
  if (deps['nuxt']) return 'nuxt'
  if (deps['astro']) return 'astro'
  if (deps['@remix-run/node'] || deps['remix']) return 'remix'
  if (deps['@tauri-apps/api']) return 'tauri'
  if (deps['electron']) return 'electron'
  if (deps['hono']) return 'hono'
  if (deps['elysia']) return 'elysia'
  if (deps['fastify']) return 'fastify'
  if (deps['express']) return 'express'
  if (deps['react']) return 'react'
  if (deps['vue']) return 'vue'
  if (deps['@angular/core']) return 'angular'
  if (deps['vite']) return 'vite'

  return 'unknown'
}

function detectPyScripts(content: string): Record<string, string> {
  const scripts: Record<string, string> = {}
  const sectionMatch = content.match(/\[project\.scripts\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/)
  if (!sectionMatch) return scripts
  const lines = sectionMatch[1].split('\n')
  for (const line of lines) {
    const m = line.match(/^(\w[\w-]*)\s*=\s*"([^"]+)"/)
    if (m) scripts[m[1]] = m[2]
  }
  return scripts
}

async function detectPythonFramework(fullPath: string): Promise<Framework> {
  try {
    const pyproject = await readFile(join(fullPath, 'pyproject.toml'), 'utf-8')
    if (pyproject.includes('fastapi')) return 'fastapi'
    if (pyproject.includes('flask')) return 'flask'
    if (pyproject.includes('django')) return 'django'
    if (pyproject.includes('streamlit')) return 'streamlit'
  } catch {
    /* */
  }

  try {
    const reqs = await readFile(join(fullPath, 'requirements.txt'), 'utf-8')
    if (reqs.includes('fastapi')) return 'fastapi'
    if (reqs.includes('flask')) return 'flask'
    if (reqs.includes('django')) return 'django'
    if (reqs.includes('streamlit')) return 'streamlit'
  } catch {
    /* */
  }

  return 'unknown'
}

/** `.atlas` accepts `umami: "<id>"`, `["<id>", …]` or `{ websiteIds, instance }`. */
function parseAtlasUmami(value: unknown): UmamiInfo | undefined {
  if (typeof value === 'string') return { websiteIds: [value] }
  if (Array.isArray(value))
    return { websiteIds: value.filter((v): v is string => typeof v === 'string') }
  if (value && typeof value === 'object') {
    const { websiteIds, instance } = value as { websiteIds?: unknown; instance?: unknown }
    if (Array.isArray(websiteIds)) {
      return {
        websiteIds: websiteIds.filter((v): v is string => typeof v === 'string'),
        instance: typeof instance === 'string' ? instance : undefined,
      }
    }
  }
  return undefined
}

async function getProjectInfo(
  fullPath: string,
  skipGit: boolean = false,
): Promise<Partial<Project>> {
  const info: Partial<Project> = {}
  let homepage: string | undefined

  // Node.js project
  try {
    const pkg = JSON.parse(await readFile(join(fullPath, 'package.json'), 'utf-8'))
    info.description = pkg.description
    if (typeof pkg.homepage === 'string') homepage = pkg.homepage
    info.type = 'node'
    info.scripts = pkg.scripts
    info.framework = detectFrameworkFromPkg(pkg)

    if (pkg.scripts?.dev) info.devCommand = 'dev'
    else if (pkg.scripts?.start) info.devCommand = 'start'
    else if (pkg.scripts?.serve) info.devCommand = 'serve'
  } catch {
    /* no package.json */
  }

  // Python project
  if (!info.type) {
    try {
      const pyproject = await readFile(join(fullPath, 'pyproject.toml'), 'utf-8')
      const descMatch = pyproject.match(/description\s*=\s*"([^"]+)"/)
      if (descMatch) info.description = descMatch[1]
      info.type = 'python'
      info.framework = await detectPythonFramework(fullPath)
      const pyScripts = detectPyScripts(pyproject)
      if (Object.keys(pyScripts).length > 0) info.scripts = pyScripts
    } catch {
      /* no pyproject.toml */
    }
  }

  // Cargo (Rust)
  if (!info.type) {
    try {
      const cargo = await readFile(join(fullPath, 'Cargo.toml'), 'utf-8')
      const descMatch = cargo.match(/description\s*=\s*"([^"]+)"/)
      if (descMatch) info.description = descMatch[1]
      info.type = 'rust'
      info.framework = cargo.includes('tauri') ? 'tauri' : 'unknown'
    } catch {
      /* no Cargo.toml */
    }
  }

  // Go module
  if (!info.type) {
    try {
      await stat(join(fullPath, 'go.mod'))
      info.type = 'go'
      info.framework = 'unknown'
    } catch {
      /* no go.mod */
    }
  }

  // Swift package
  if (!info.type) {
    try {
      const swift = await readFile(join(fullPath, 'Package.swift'), 'utf-8')
      info.type = 'swift'
      info.framework = swift.includes('vapor') ? 'vapor' : 'unknown'
      info.devCommand = 'build'
    } catch {
      /* no Package.swift */
    }
  }

  // .atlas metadata — the hand-written correction layer
  {
    const meta = await readAtlas(fullPath)
    if (meta.archived) info.archived = true
    if (typeof meta.port === 'number') info.port = meta.port
    if (meta.devPublic === true) info.devPublic = true
    if (typeof meta.slug === 'string' && meta.slug) info.slug = slugify(meta.slug)
    // Manual overrides — listed before anything detected from the project's files.
    const atlasDomains = mergeDomains(
      typeof meta.domain === 'string' ? [meta.domain] : undefined,
      meta.domains as string[] | undefined,
    )
    if (atlasDomains.length > 0) info.domains = atlasDomains
    const atlasUmami = parseAtlasUmami(meta.umami)
    if (atlasUmami && atlasUmami.websiteIds.length > 0) info.umami = atlasUmami
    // Overrides beat detection: this is the file the settings UI writes, and a correction
    // that loses to a heuristic is not a correction. Presence alone still marks a folder as
    // an intentional project — that is what `type` falls back to.
    if (typeof meta.type === 'string' && meta.type) info.type = meta.type
    if (typeof meta.framework === 'string' && meta.framework)
      info.framework = meta.framework as Framework
    if (typeof meta.description === 'string' && meta.description)
      info.description = meta.description
    if (Object.keys(meta).length > 0 && !info.type) {
      info.type = 'generic'
      info.framework ??= 'unknown'
    }
  }

  // README - only check existence, load content lazily
  try {
    const readmePath = join(fullPath, 'README.md')
    await stat(readmePath)
    info.readme = '__HAS_README__' // marker for lazy loading
    if (!info.description) {
      // Read only first 512 bytes for description extraction
      const fh = await open(readmePath, 'r')
      const buf = Buffer.alloc(512)
      await fh.read(buf, 0, 512, 0)
      await fh.close()
      const text = buf.toString('utf-8')
      const firstLine = text
        .split('\n')
        .find((l) => l && !l.startsWith('#'))
        ?.trim()
      if (firstLine) info.description = firstLine.slice(0, 150)
    }
  } catch {
    /* no readme */
  }

  const [
    runner,
    justfileInfo,
    deployInfo,
    beadsInfo,
    domains,
    claudeSessions,
    agentFiles,
    claudeSetup,
    template,
  ] = await Promise.all([
    detectRunner(fullPath),
    detectJustfile(fullPath),
    detectDeploy(fullPath),
    detectBeads(fullPath),
    detectDomains(fullPath, { homepage }),
    detectClaudeSessions(fullPath),
    detectAgentFiles(fullPath),
    detectClaudeSetup(fullPath),
    detectTemplate(fullPath),
  ])

  info.runner = runner
  const allDomains = mergeDomains(info.domains, domains)
  if (allDomains.length > 0) info.domains = allDomains
  if (beadsInfo) info.beads = beadsInfo
  if (claudeSessions) info.claudeSessions = claudeSessions
  if (agentFiles) info.agentFiles = agentFiles
  if (claudeSetup) info.claudeSetup = claudeSetup
  if (template) info.template = template
  if (justfileInfo.hasJustfile) {
    info.hasJustfile = true
    info.justRecipes = justfileInfo.recipes
  }
  if (deployInfo.length > 0) info.deploy = deployInfo

  if (!skipGit) {
    const gitInfo = await detectGitStatus(fullPath)
    info.git = gitInfo.status
    info.gitBranch = gitInfo.branch
    info.flow = gitInfo.flow
  }

  return info
}

async function scanFolder(
  baseDir: string,
  dir: string,
  depth: number = 0,
  skipGit: boolean = false,
  folders: string[] = [],
  config: AtlasConfig = DEFAULT_CONFIG,
): Promise<Project[]> {
  let entries: string[]

  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  const validEntries: { entry: string; fullPath: string; stats: Stats }[] = []

  // Parallel stat check
  const statResults = await Promise.all(
    entries
      .filter((entry) => !entry.startsWith('.') && !IGNORE.has(entry))
      .map(async (entry) => {
        const fullPath = join(dir, entry)
        try {
          const stats = await stat(fullPath)
          return stats.isDirectory() ? { entry, fullPath, stats } : null
        } catch {
          return null
        }
      }),
  )

  for (const result of statResults) {
    if (result) validEntries.push(result)
  }

  // Parallel project info gathering
  const projectResults = await Promise.all(
    validEntries.map(async ({ entry, fullPath, stats }) => {
      const relPath = relative(baseDir, fullPath)
      // Ignored folders leave no trace: no project, no move target, and no walk underneath.
      if (isIgnored(config, relPath)) return []
      const forced = config.force[relPath]
      const info: Partial<Project> = forced === false ? {} : await getProjectInfo(fullPath, skipGit)
      // `force: true` catalogs a folder the detectors have no opinion about; `false` demotes
      // one they got wrong back to a container the walk passes straight through.
      const isProject = forced === false ? false : Boolean(info.type) || forced === true
      const rows: Project[] = []

      if (isProject) {
        const promotion = await detectPromotion(entry, baseDir)
        const archived = info.archived || relPath.includes('_archive') || undefined
        rows.push({
          name: entry,
          path: fullPath,
          relativePath: relPath,
          modifiedAt: stats.mtime.toISOString(),
          type: 'generic',
          ...info,
          slug: info.slug ?? slugify(relPath),
          ...(promotion ? { promotion } : {}),
          ...(archived ? { archived } : {}),
        } as Project)
      } else if (depth < 2) {
        // Collect non-project folders for move targets (during same traversal)
        folders.push(relPath || entry)
      }

      // A project normally ends the walk — its subfolders are its own business. An explicit
      // depth entry is the one way in, which is what catalogs the apps inside a monorepo.
      const descend = !isProject || relPath in config.depth
      if (descend && depth + 1 <= depthLimit(config, relPath)) {
        rows.push(...(await scanFolder(baseDir, fullPath, depth + 1, skipGit, folders, config)))
      }

      return rows
    }),
  )

  return projectResults.flat()
}

async function collectFolders(baseDir: string, dir: string, depth: number = 0): Promise<string[]> {
  if (depth > 2) return []

  const folders: string[] = []
  let entries: string[]

  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  for (const entry of entries) {
    if (entry.startsWith('.') || IGNORE.has(entry)) continue

    const fullPath = join(dir, entry)
    let stats

    try {
      stats = await stat(fullPath)
    } catch {
      continue
    }

    if (!stats.isDirectory()) continue

    // Check if it's a project folder
    const hasProject = await getProjectInfo(fullPath)
    if (!hasProject.type) {
      folders.push(relative(baseDir, fullPath) || entry)
      const subFolders = await collectFolders(baseDir, fullPath, depth + 1)
      folders.push(...subFolders)
    }
  }

  return folders
}

const CACHE_FILE = '.atlas-cache.json'
const CACHE_TTL = 60 * 1000 // 1 minute before considered stale
/** Bump when the cached Project shape changes — a mismatch forces a full rescan. */
const CACHE_SHAPE_VERSION = 6

interface CachedIndex extends ProjectAtlas {
  cachedAt: number
  shapeVersion: number
}

export interface ScanResult extends ProjectAtlas {
  fromCache: boolean
  stale: boolean
}

/**
 * Walk one root and return its projects — no cache read, no cache write, no host merge.
 * Exported because the scan agent shipped to Fractal/Ubuntu runs exactly this and nothing else.
 */
export async function performScan(baseDir: string, skipGit: boolean): Promise<ProjectAtlas> {
  const folders: string[] = []
  const config = await readConfig(baseDir)
  const projects = await scanFolder(baseDir, baseDir, 0, skipGit, folders, config)
  await attachUmami(baseDir, projects)
  projects.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())

  // Stamped here rather than in `scanFolder` so there is one place to look. A remote scan
  // gets re-stamped with its own host id on arrival, so a stale agent bundle can't lie.
  const hostId = getPrimaryHost().id
  for (const p of projects) {
    p.host = hostId
    p.isLocal = true
  }

  const frameworks = [...new Set(projects.map((p) => p.framework).filter(Boolean))] as Framework[]

  return {
    baseDir,
    scannedAt: new Date().toISOString(),
    projects,
    frameworks,
    folders,
  }
}

/** One remote host's last scan, written by `remoteScan.ts`, read back here at merge time. */
export interface HostFragment {
  hostId: string
  root: string
  scannedAt: string
  status: 'ok' | 'unreachable' | 'error'
  error?: string
  projects: Project[]
}

/**
 * `<primary root>/.atlas-cache-<hostId>.json` — one file per remote host.
 *
 * **Internal.** Unlike the main cache (which atlas-picker reads directly and which carries
 * `shapeVersion` so a reader can detect a shape change), a fragment is unversioned plumbing
 * between `remoteScan.ts` and `finalizeAtlas`. Outside consumers read the registry
 * (`shared/hosts.json`) and `/api/projects`, never this.
 */
export const hostFragmentPath = (baseDir: string, hostId: string): string =>
  join(baseDir, `.atlas-cache-${hostId}.json`)

/**
 * Write via temp-file + rename. Four writers touch the main cache (`scan`, `revalidate` →
 * `enrichCacheWithGit`, `updateCachedPort`, the host merge) and atlas-picker parses it with a
 * hard failure on a torn read — a partial write takes down the whole picker, not one row.
 * The host fragments go through it too: `readHostFragments` swallows a parse error as "that
 * host is simply missing", so a torn fragment silently drops 27 projects from the merge.
 */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(data))
  await rename(tmp, path)
}

async function readHostFragments(baseDir: string): Promise<HostFragment[]> {
  const fragments = await Promise.all(
    getHosts()
      .filter((h) => h.ssh !== null)
      .map(async (h): Promise<HostFragment | null> => {
        try {
          return JSON.parse(await readFile(hostFragmentPath(baseDir, h.id), 'utf-8'))
        } catch {
          return null // never synced, or mid-write — the catalog is simply short by that host
        }
      }),
  )
  return fragments.filter((f): f is HostFragment => f !== null)
}

/**
 * Link a remote project to its primary-host twin by exact name.
 *
 * Deliberately not matched on git remote URL: most Ubuntu copies are rsync'd with no remote
 * at all, so that rule would fail exactly where the link is wanted. The M2 catalog carries
 * ~22 internally duplicated names, so an ambiguous name yields **no link** rather than a guess.
 */
function linkAlsoOn(local: Project[], remote: Project[]): void {
  const byName = new Map<string, Project[]>()
  for (const p of local) {
    delete p.alsoOn // recomputed from scratch — `finalizeAtlas` must stay idempotent
    const group = byName.get(p.name)
    if (group) group.push(p)
    else byName.set(p.name, [p])
  }

  for (const r of remote) {
    const candidates = byName.get(r.name)
    if (candidates?.length !== 1) continue
    const source = candidates[0]
    ;(r.alsoOn ??= []).push({ host: source.host, path: source.path })
    ;(source.alsoOn ??= []).push({ host: r.host, path: r.path })
  }
}

/**
 * Fold every remote host fragment into a freshly scanned primary atlas.
 *
 * Idempotent by construction: it drops any non-local project first, so calling it on an
 * already-merged atlas (which `/api/refresh` does) re-derives rather than duplicates.
 * Only the primary root gets a merge — an explicit `?dir=` scan stays exactly what it was.
 */
export async function finalizeAtlas(baseDir: string, atlas: ProjectAtlas): Promise<ProjectAtlas> {
  const primary = getPrimaryHost()
  if (baseDir !== primary.root) return atlas

  const local = atlas.projects.filter((p) => p.isLocal)
  const fragments = await readHostFragments(baseDir)
  const remote = fragments.flatMap((f) =>
    f.projects.map((p) => {
      const { isLocal, ...rest } = p
      return { ...rest, host: f.hostId } as Project
    }),
  )
  linkAlsoOn(local, remote)

  const hosts: HostState[] = [
    {
      id: primary.id,
      root: primary.root,
      scannedAt: atlas.scannedAt,
      status: 'ok',
      projectCount: local.length,
    },
    ...fragments.map((f) => ({
      id: f.hostId,
      root: f.root,
      scannedAt: f.scannedAt,
      status: f.status,
      ...(f.error ? { error: f.error } : {}),
      projectCount: f.projects.length,
    })),
  ]

  return { ...atlas, projects: [...local, ...remote], hosts }
}

let revalidating: Promise<void> | null = null

/**
 * Refresh a stale cache behind the answer already served.
 *
 * `scan` used to compute `stale` and do nothing with it, so a cache aged without bound and
 * `atlas <query>` kept naming paths that had moved hours earlier. One sweep at a time, and
 * failures stay silent because the caller already has its answer.
 */
function revalidate(baseDir: string): void {
  if (revalidating) return
  revalidating = performScan(baseDir, true)
    .then((result) => enrichCacheWithGit(join(baseDir, CACHE_FILE), result, baseDir))
    .catch(() => {})
    .finally(() => {
      revalidating = null
    })
}

export async function scan(
  baseDir: string,
  options: { skipGit?: boolean; useCache?: boolean; forceRefresh?: boolean } = {},
): Promise<ScanResult> {
  const { skipGit = false, useCache = true, forceRefresh = false } = options
  const cachePath = join(baseDir, CACHE_FILE)

  // Always return cache first if available (stale-while-revalidate)
  if (useCache && !forceRefresh) {
    try {
      const cached: CachedIndex = JSON.parse(await readFile(cachePath, 'utf-8'))
      const age = Date.now() - cached.cachedAt
      // Always return cache - let client decide to refresh in background
      if (cached.shapeVersion === CACHE_SHAPE_VERSION) {
        const stale = age > CACHE_TTL
        if (stale) revalidate(baseDir)
        return { ...cached, fromCache: true, stale }
      }
    } catch {
      /* no cache or invalid */
    }
  }

  const result = await finalizeAtlas(baseDir, await performScan(baseDir, skipGit))

  // Save to cache (fire and forget)
  const cacheData: CachedIndex = {
    ...result,
    cachedAt: Date.now(),
    shapeVersion: CACHE_SHAPE_VERSION,
  }
  writeJsonAtomic(cachePath, cacheData).catch(() => {})

  return { ...result, fromCache: false, stale: false }
}

export async function getGitStatus(
  projectPath: string,
): Promise<{ status: GitStatus; branch?: string; flow?: GitFlow }> {
  return detectGitStatus(projectPath)
}

export async function getReadme(projectPath: string): Promise<string | null> {
  try {
    return await readFile(join(projectPath, 'README.md'), 'utf-8')
  } catch {
    return null
  }
}

export async function updateDescription(projectPath: string, description: string): Promise<void> {
  // Try package.json
  const pkgPath = join(projectPath, 'package.json')
  try {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'))
    pkg.description = description
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    return
  } catch {
    /* no package.json */
  }

  // Try pyproject.toml
  const pyPath = join(projectPath, 'pyproject.toml')
  try {
    let content = await readFile(pyPath, 'utf-8')
    if (content.includes('description')) {
      content = content.replace(/description\s*=\s*"[^"]*"/, `description = "${description}"`)
    } else {
      content = content.replace(/\[project\]/, `[project]\ndescription = "${description}"`)
    }
    await writeFile(pyPath, content)
    return
  } catch {
    /* no pyproject.toml */
  }

  // Try Cargo.toml
  const cargoPath = join(projectPath, 'Cargo.toml')
  try {
    let content = await readFile(cargoPath, 'utf-8')
    if (content.includes('description')) {
      content = content.replace(/description\s*=\s*"[^"]*"/, `description = "${description}"`)
    } else {
      content = content.replace(/\[package\]/, `[package]\ndescription = "${description}"`)
    }
    await writeFile(cargoPath, content)
    return
  } catch {
    /* no Cargo.toml */
  }

  // Fallback: create/update .atlas (only if description is non-empty)
  if (description) await patchAtlas(projectPath, { description })
}

export async function setArchived(projectPath: string, archived: boolean): Promise<void> {
  await patchAtlas(projectPath, { archived: archived || null })
}

/**
 * The slug `.atlas` says right now, not the one the cache scanned. A slug edited since the
 * last scan would otherwise register the folder-derived hostname and spend two certificates.
 */
export async function currentSlug(project: Pick<Project, 'path' | 'relativePath'>): Promise<string> {
  const meta = await readAtlas(project.path)
  return typeof meta.slug === 'string' && meta.slug ? slugify(meta.slug) : slugify(project.relativePath)
}

export async function setPort(projectPath: string, port: number): Promise<void> {
  await patchAtlas(projectPath, { port })
}

/**
 * Patch a project's port directly into `.atlas-cache.json`. `setPort` only writes `.atlas`;
 * without this, `scan()`'s cache-first read keeps serving the old (portless) record until the
 * next background revalidation, so the very next `/api/run` call would allocate a fresh port
 * all over again instead of reusing the one just persisted.
 */
export async function updateCachedPort(
  baseDir: string,
  projectPath: string,
  port: number,
): Promise<void> {
  const cachePath = join(baseDir, CACHE_FILE)
  try {
    const cached: CachedIndex = JSON.parse(await readFile(cachePath, 'utf-8'))
    const project = cached.projects.find((p) => p.path === projectPath)
    if (project) project.port = port
    await writeJsonAtomic(cachePath, cached)
  } catch {
    /* no cache yet — the next full scan will read the persisted .atlas port */
  }
}

/**
 * Fill in git state and persist the cache. `baseDir` is what makes this the single write
 * point that also re-merges the remote fragments — without it, every revalidation would
 * overwrite the merged catalog with a local-only scan 60 seconds after the merge.
 */
export async function enrichCacheWithGit(
  cachePath: string,
  atlas: ProjectAtlas,
  baseDir: string,
): Promise<void> {
  const BATCH_SIZE = 20
  // Local projects only: a remote path has no repo here, so `git` would spawn once per
  // remote project just to fail. Remote git state comes from that host's own scan.
  const projects = atlas.projects.filter((p) => p.isLocal)

  for (let i = 0; i < projects.length; i += BATCH_SIZE) {
    const batch = projects.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map((p) => detectGitStatus(p.path)))
    for (let j = 0; j < batch.length; j++) {
      batch[j].git = results[j].status
      batch[j].gitBranch = results[j].branch
      batch[j].flow = results[j].flow
    }
  }

  const cacheData: CachedIndex = {
    ...(await finalizeAtlas(baseDir, atlas)),
    cachedAt: Date.now(),
    shapeVersion: CACHE_SHAPE_VERSION,
  }
  await writeJsonAtomic(cachePath, cacheData)
}

export async function scanAndSave(baseDir: string, outputPath: string): Promise<ProjectAtlas> {
  const index = await scan(baseDir)
  await writeFile(outputPath, JSON.stringify(index, null, 2))
  return index
}

// CLI usage.
//
// `pathToFileURL` rather than a `file://` + argv[1] template: on Windows the template yields
// `file://C:\Users\…` against an `import.meta.url` of `file:///C:/Users/…`, which is never
// equal — the bundled agent would exit 0 with no output on Fractal, silently.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const baseDir = process.argv[2] || process.cwd()

  // `--json`: the scan-agent mode. Pure JSON on stdout, no cache read, no file written —
  // this is what `atlas hosts sync` ships to Fractal and Ubuntu and runs over SSH.
  if (process.argv.includes('--json')) {
    const index = await performScan(baseDir, process.argv.includes('--skip-git'))
    process.stdout.write(JSON.stringify(index))
  } else {
    const output = process.argv[3] || join(baseDir, 'projects.json')

    console.log(`Scanning: ${baseDir}`)
    const index = await scanAndSave(baseDir, output)
    console.log(`Found ${index.projects.length} projects`)
    console.log(`Frameworks: ${index.frameworks.join(', ')}`)
    console.log(`Saved to: ${output}`)
  }
}
