/**
 * What a process is, from its kernel name (`exe`), argv[0] and — for a runtime — the script it
 * runs. Pure and table-driven; classified afresh every snapshot (`cargo run` execs in place, so
 * a pid's kind can change under the same start time).
 */
import { type PsRow, redact } from './parse'
import { type Family, runtimeOf, type Shape, shapeOf } from './shape'
import type { ProcessKind } from './types'

/**
 * The role a process plays. Internal: it decides which member names an app row, which rows are
 * development rows and which can be flagged. `kind` (the contract) is the binary family.
 */
export type Role =
  | 'agent'
  | 'mcp'
  | 'dev-server'
  | 'build'
  | 'language-server'
  | 'runner'
  | 'program'
  | 'infra'
  | 'tool'
  | 'shell'
  | 'app'
  | 'system'
  | 'other'

/** Which member names an app row: the first role in this list wins. */
export const RANK: readonly Role[] = [
  'agent',
  'dev-server',
  'mcp',
  'language-server',
  'program',
  'build',
  'infra',
  'tool',
  'app',
  'runner',
  'shell',
  'system',
  'other',
]

export interface Classified {
  kind: ProcessKind
  role: Role
  name: string
  tool?: string
}

/** Binary families by argv[0] (or exe), runtimes aside. */
const FAMILIES: [RegExp, ProcessKind][] = [
  [/^(uv|uvx)$/, 'uv'],
  [/^(npm|npx|pnpm|yarn)$/, 'node'],
  [/^cargo$/, 'cargo'],
  [/^rustc$/, 'rustc'],
  [/^(go|compile|asm)$/, 'go'],
  [/^dolt$/, 'dolt'],
  [/^bd$/, 'beads'],
  [/^(docker|dockerd|containerd|com\.docker\..*|vpnkit.*)$/, 'docker'],
  [/^caddy$/, 'caddy'],
  [/^ollama$/, 'ollama'],
  [/^(sh|bash|zsh|dash|fish|tmux|screen)$/, 'shell'],
]

const LANGUAGE_SERVER =
  /tsserver|typingsInstaller|pyright|rust-analyzer|gopls|sourcekit-lsp|lsp-proxy|svelte-language-server|svelteserver|[\w-]*language-?server|[\w-]*langserver/
const INFRA =
  /^(docker|dockerd|containerd|com\.docker\..*|vpnkit.*|caddy|ollama|postgres|mysqld|redis-server|mongod|nginx|OrbStack.*)$/
const RUNNERS =
  /^(uv|uvx|npm|npx|pnpm|yarn|bunx|just|make|concurrently|turbo|nodemon|watchexec|env|nohup|timeout|gtimeout|tsx|onenv)$/
const MCP = /(^|[/_.-])mcp([/_.@-]|$)/i
const BUILD_NAMES =
  /^(tsc|esbuild|rollup|webpack|rustc|cc|clang|clang\+\+|ld|xcodebuild|swiftc|swift-frontend|compile|asm|link|svelte-check|biome|eslint|prettier|stylelint|vitest|jest|playwright|pytest|ruff|mypy)$/
const DEV_NAMES =
  /^(vite|next|next-server|nuxt|nuxi|astro|wrangler|workerd|uvicorn|gunicorn|hypercorn|flask|streamlit|jupyter|ipykernel|http\.server)([-_].*)?$/
const TOOLS =
  /^(bd|git|gh|ssh|scp|rsync|op|curl|wget|rg|jq|lsof|ps|tail|less|sleep|caffeinate|osascript|it2|atlas|brew|vim|nvim|top|htop)$/
const SHELLS = /^(sh|bash|zsh|dash|fish|tmux|screen)$/
const BUILD_VERB = /^(build|check|test|lint|typecheck|clippy|vet)$/
const DEV_VERB = /^(dev|serve|preview|start|runserver)$/
/** The first dev or build verb among the first two non-flag tokens after the entry. */
function verbOf(rest: string[]): 'dev' | 'build' | undefined {
  for (const t of rest.filter((t) => !t.startsWith('-')).slice(0, 2)) {
    if (BUILD_VERB.test(t)) return 'build'
    if (DEV_VERB.test(t)) return 'dev'
  }
  return undefined
}

/** `bun run x`, `bun x y` or `bun <script>`, but not `bun test` / `bun build`. */
function isBunRunner(s: Shape): boolean {
  const sub = s.rest[0] ?? ''
  return sub === 'run' || sub === 'x' || (/^[\w:-]+$/.test(sub) && !BUILD_VERB.test(sub))
}

function isRunner(s: Shape): boolean {
  if (RUNNERS.test(s.a0) || RUNNERS.test(s.name)) return true
  if (SHELLS.test(s.a0)) return s.rest[0] === '-c'
  if (s.a0 === 'cargo' || s.a0 === 'go') return s.rest[0] === 'run' || s.rest[0] === 'watch'
  return s.runtime === 'bun' && !s.entry && isBunRunner(s)
}

const isAgent = (s: Shape) =>
  (/^\d+\.\d+\.\d+$/.test(s.exe) && s.a0 === 'claude') ||
  s.exe === 'claude' ||
  s.exe === 'codex' ||
  s.name === 'codex'

/** Where a binary lives, for whatever no name rule claimed. */
function roleByPath(argv0: string): Role {
  const app = argv0.indexOf('.app/Contents/')
  if (argv0.startsWith('/System/')) return 'system'
  if (app > 0 || argv0.includes('/Library/Application Support/')) return 'app'
  if (/^\/(usr\/libexec|usr\/sbin|sbin|Library\/Apple)\//.test(argv0)) return 'system'
  if (/^\/(Users\/[^/]+|var\/folders|tmp|private)\//.test(argv0)) return 'program'
  if (/^\/(opt\/homebrew|usr\/local|usr\/bin|bin)\//.test(argv0)) return 'tool'
  return 'other'
}

/** The rules in order; the first that returns a role wins. */
const RULES: ((s: Shape) => Role | undefined)[] = [
  (s) => (isAgent(s) ? 'agent' : undefined),
  (s) => (LANGUAGE_SERVER.test(s.entry ?? s.a0) ? 'language-server' : undefined),
  (s) => (INFRA.test(s.a0) || INFRA.test(s.exe) || s.a0 === 'dolt' ? 'infra' : undefined),
  (s) => (isRunner(s) ? 'runner' : undefined),
  (s) => (MCP.test(s.name) ? 'mcp' : undefined),
  (s) => (TOOLS.test(s.name) ? 'tool' : SHELLS.test(s.name) ? 'shell' : undefined),
  (s) => (BUILD_NAMES.test(s.name) || verbOf(s.rest) === 'build' ? 'build' : undefined),
  (s) => (DEV_NAMES.test(s.name) || verbOf(s.rest) === 'dev' ? 'dev-server' : undefined),
  // A runtime renamed by its own code ("Raycast Backend") is an app; any other is user code.
  (s) => (s.runtime ? (!s.argv0.includes('/') && !runtimeOf(s.a0) ? 'app' : 'program') : undefined),
]

function roleOf(s: Shape): Role {
  for (const rule of RULES) {
    const role = rule(s)
    if (role) return role
  }
  return roleByPath(s.argv0)
}

function familyOf(s: Shape): Family {
  if (isAgent(s)) return s.exe === 'codex' || s.name === 'codex' ? 'codex' : 'claude'
  if (s.argv0.includes('/go-build')) return 'go'
  const byName = (n: string) => FAMILIES.find(([re]) => re.test(n))?.[1]
  return s.runtime ?? byName(s.a0) ?? byName(s.exe)
}

const PASS_THROUGH = new Set<Role>(['system', 'app', 'mcp', 'language-server'])

/** The kind is the binary family, except where the role says more than the binary does. */
function kindOf(role: Role, family: Family): ProcessKind {
  if (PASS_THROUGH.has(role)) return role as ProcessKind
  return family ?? 'other'
}

/**
 * The tool running inside a runtime, by its canonical name (`jupyter-kernel` and
 * `ipykernel_launcher` are both jupyter), an MCP server's name, or a language server's.
 */
function toolName(s: Shape, role: Role): string | undefined {
  if (role === 'language-server') return (s.entry ?? s.a0).match(LANGUAGE_SERVER)?.[0]
  if (role === 'mcp') return s.app ?? s.name
  if (!s.runtime || runtimeOf(s.name)) return undefined
  if (![DEV_NAMES, BUILD_NAMES, RUNNERS].some((re) => re.test(s.name))) return undefined
  if (/^(jupyter|ipykernel)/.test(s.name)) return 'jupyter'
  return s.name === 'next-server' ? 'next' : s.name
}

function nameOf(s: Shape, role: Role, tool: string | undefined): string {
  if (role === 'agent') return familyOf(s) ?? s.a0
  if (role === 'app') return s.app ?? s.title ?? s.a0
  return tool ?? s.name
}

/** Classify one ps row. `selfUid` is the daemon's user: anyone else's process is system. */
export function classify(
  row: Pick<PsRow, 'exe' | 'args' | 'uid' | 'argsUnavailable' | 'zombie'>,
  selfUid: number,
): Classified {
  const s = shapeOf(row)
  let role = row.uid === selfUid ? roleOf(s) : 'system'
  // A program whose script sits in an `mcp`-named folder is an MCP server (`~/dev/mcp/channels`).
  if (
    role === 'program' &&
    s.entry
      ?.split('/')
      .slice(0, -1)
      .some((d) => MCP.test(d))
  )
    role = 'mcp'
  const tool = toolName(s, role)
  return {
    kind: kindOf(role, familyOf(s)),
    role,
    // A runtime can retitle itself to anything, its argv included: a name leaves the server too.
    name: redact(nameOf(s, role, tool)),
    ...(tool ? { tool: redact(tool) } : {}),
  }
}
