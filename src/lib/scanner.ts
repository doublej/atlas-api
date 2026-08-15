import { exec } from 'node:child_process'
import type { Dirent, Stats } from 'node:fs'
import { open, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'
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
const MAX_DEPTH = 3

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

export interface PromotionStatus {
  status: 'none' | 'draft' | 'in-progress' | 'ready' | 'published'
  platforms: Record<string, string>
  vaultPath?: string
}

export interface Project {
  name: string
  path: string
  relativePath: string
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
  domains?: string[]
  umami?: UmamiInfo
  claudeSessions?: ClaudeSessionsInfo
  agentFiles?: AgentFilesInfo
}

export type { UmamiInfo }

export interface ProjectAtlas {
  baseDir: string
  scannedAt: string
  projects: Project[]
  frameworks: Framework[]
  folders: string[]
}

async function detectRunner(fullPath: string): Promise<Project['runner'] | undefined> {
  const checks: [string, Project['runner']][] = [
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
  const trunk = meta?.trunk ?? (refs.includes('main') ? 'main' : refs.includes('master') ? 'master' : branch)
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

  // .atlas metadata (fallback for type detection + archive flag)
  try {
    const raw = await readFile(join(fullPath, '.atlas'), 'utf-8')
    const meta = JSON.parse(raw)
    if (meta.archived) info.archived = true
    if (meta.port) info.port = meta.port
    // Manual overrides — listed before anything detected from the project's files.
    const atlasDomains = mergeDomains(
      typeof meta.domain === 'string' ? [meta.domain] : undefined,
      meta.domains,
    )
    if (atlasDomains.length > 0) info.domains = atlasDomains
    const atlasUmami = parseAtlasUmami(meta.umami)
    if (atlasUmami && atlasUmami.websiteIds.length > 0) info.umami = atlasUmami
    // Presence of .atlas marks the folder as an intentional project.
    if (!info.type) {
      info.type = meta.type ?? 'generic'
      if (meta.description) info.description = meta.description
      info.framework = meta.framework ?? 'unknown'
    }
  } catch {
    /* no .atlas */
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

  const [runner, justfileInfo, deployInfo, beadsInfo, domains, claudeSessions, agentFiles] =
    await Promise.all([
      detectRunner(fullPath),
      detectJustfile(fullPath),
      detectDeploy(fullPath),
      detectBeads(fullPath),
      detectDomains(fullPath, { homepage }),
      detectClaudeSessions(fullPath),
      detectAgentFiles(fullPath),
    ])

  info.runner = runner
  const allDomains = mergeDomains(info.domains, domains)
  if (allDomains.length > 0) info.domains = allDomains
  if (beadsInfo) info.beads = beadsInfo
  if (claudeSessions) info.claudeSessions = claudeSessions
  if (agentFiles) info.agentFiles = agentFiles
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
): Promise<Project[]> {
  if (depth > MAX_DEPTH) return []

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
      const info = await getProjectInfo(fullPath, skipGit)

      if (info.type) {
        const promotion = await detectPromotion(entry, baseDir)
        const relPath = relative(baseDir, fullPath)
        const archived = info.archived || relPath.includes('_archive') || undefined
        return [
          {
            name: entry,
            path: fullPath,
            relativePath: relPath,
            modifiedAt: stats.mtime.toISOString(),
            ...info,
            ...(promotion ? { promotion } : {}),
            ...(archived ? { archived } : {}),
          } as Project,
        ]
      } else {
        // Collect non-project folders for move targets (during same traversal)
        if (depth < 2) {
          folders.push(relative(baseDir, fullPath) || entry)
        }
        const subProjects = await scanFolder(baseDir, fullPath, depth + 1, skipGit, folders)

        return subProjects
      }
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
const CACHE_SHAPE_VERSION = 3

interface CachedIndex extends ProjectAtlas {
  cachedAt: number
  shapeVersion: number
}

export interface ScanResult extends ProjectAtlas {
  fromCache: boolean
  stale: boolean
}

async function performScan(baseDir: string, skipGit: boolean): Promise<ProjectAtlas> {
  const folders: string[] = []
  const projects = await scanFolder(baseDir, baseDir, 0, skipGit, folders)
  await attachUmami(baseDir, projects)
  projects.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())

  const frameworks = [...new Set(projects.map((p) => p.framework).filter(Boolean))] as Framework[]

  return {
    baseDir,
    scannedAt: new Date().toISOString(),
    projects,
    frameworks,
    folders,
  }
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
        return { ...cached, fromCache: true, stale: age > CACHE_TTL }
      }
    } catch {
      /* no cache or invalid */
    }
  }

  const result = await performScan(baseDir, skipGit)

  // Save to cache (fire and forget)
  const cacheData: CachedIndex = {
    ...result,
    cachedAt: Date.now(),
    shapeVersion: CACHE_SHAPE_VERSION,
  }
  writeFile(cachePath, JSON.stringify(cacheData)).catch(() => {})

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
  if (description) {
    const piPath = join(projectPath, '.atlas')
    try {
      const existing = JSON.parse(await readFile(piPath, 'utf-8'))
      existing.description = description
      await writeFile(piPath, JSON.stringify(existing, null, 2) + '\n')
    } catch {
      await writeFile(piPath, JSON.stringify({ description }, null, 2) + '\n')
    }
  }
}

export async function setArchived(projectPath: string, archived: boolean): Promise<void> {
  const atlasPath = join(projectPath, '.atlas')
  let meta: Record<string, unknown> = {}
  try {
    meta = JSON.parse(await readFile(atlasPath, 'utf-8'))
  } catch {
    /* no existing .atlas */
  }

  if (archived) {
    meta.archived = true
  } else {
    delete meta.archived
  }

  await writeFile(atlasPath, JSON.stringify(meta, null, 2) + '\n')
}

export async function enrichCacheWithGit(cachePath: string, atlas: ProjectAtlas): Promise<void> {
  const BATCH_SIZE = 20
  const { projects } = atlas

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
    ...atlas,
    cachedAt: Date.now(),
    shapeVersion: CACHE_SHAPE_VERSION,
  }
  await writeFile(cachePath, JSON.stringify(cacheData))
}

export async function scanAndSave(baseDir: string, outputPath: string): Promise<ProjectAtlas> {
  const index = await scan(baseDir)
  await writeFile(outputPath, JSON.stringify(index, null, 2))
  return index
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const baseDir = process.argv[2] || process.cwd()
  const output = process.argv[3] || join(baseDir, 'projects.json')

  console.log(`Scanning: ${baseDir}`)
  const index = await scanAndSave(baseDir, output)
  console.log(`Found ${index.projects.length} projects`)
  console.log(`Frameworks: ${index.frameworks.join(', ')}`)
  console.log(`Saved to: ${output}`)
}
