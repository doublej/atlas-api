/**
 * Reading argv: what a ps row runs — argv[0] (even with spaces in its path), and for a runtime
 * (node, bun, deno, python) the script and the name it goes by. Pure; `classify.ts` decides
 * what that makes the process.
 */
import type { PsRow } from './parse'
import type { ProcessKind } from './types'

export type Family = ProcessKind | undefined

const RUNTIMES: [RegExp, ProcessKind][] = [
  [/^node$/, 'node'],
  [/^bun$/, 'bun'],
  [/^deno$/, 'deno'],
  [/^(python[\d.]*|Python)$/, 'python'],
]
export const runtimeOf = (name: string): Family => RUNTIMES.find(([re]) => re.test(name))?.[1]

/** Names that say nothing; a package or project name is used instead. */
export const GENERIC = /^(cli|index|main|server|run|start|bin|app)$/
const NOT_A_PACKAGE = /^(dist|bin|lib|build|src|out|\.bin)$/
const SCRIPT_EXT = /\.(c|m)?(js|ts)$|\.py$/
const INLINE = new Set(['-e', '-c', '-p', '--eval', '--print', 'eval'])
const TAKES_VALUE = new Set([
  '--require',
  '-r',
  '--import',
  '--loader',
  '-X',
  '-W',
  '--cwd',
  '--config',
])

/** What classification reads off one row. */
export interface Shape {
  exe: string
  argv0: string
  /** argv[0]'s basename, a login shell's leading `-` stripped. */
  a0: string
  runtime: Family
  /** A runtime's script, `<inline>`, or the module after `-m`. */
  entry?: string
  /** The name the rules test: the script's name for a runtime, else argv[0]'s. */
  name: string
  /** Tokens after the entry (or after argv[0]). */
  rest: string[]
  /** `X` of the `X.app/` bundle the binary (or a runtime's script) lives in. */
  app?: string
  /** What a runtime renamed itself to (`Raycast Backend`, `next-server (v15.1.0)`). */
  title?: string
}

const appOf = (path: string | undefined) => path?.match(/([^/]+)\.app\//)?.[1]

const basename = (p: string) => p.replace(/\/+$/, '').split('/').pop() ?? p

/**
 * argv[0], even when its path holds spaces (`/Applications/Google Chrome.app/…`): an absolute
 * argv[0] runs up to the first space after the kernel's name for it; anything else is one token.
 */
function argv0Of(args: string, exe: string): string {
  const at = args.startsWith('/') ? args.indexOf(`/${exe}`) : -1
  const end = at < 0 ? args.search(/\s/) : args.indexOf(' ', at + exe.length + 1)
  return end < 0 ? args : args.slice(0, end)
}

/** A generic script name → its package (after the last node_modules/) or nearest meaningful dir. */
function packageName(entry: string, name: string): string {
  if (!GENERIC.test(name)) return name
  const pkg = entry.split('node_modules/').at(-1)?.split('/')[0]
  if (entry.includes('node_modules/') && pkg) return pkg
  const dirs = entry.split('/').slice(0, -1).reverse()
  return dirs.find((d) => d && !NOT_A_PACKAGE.test(d) && !d.startsWith('.')) ?? name
}

/** bun and deno take a subcommand (`bun run build`, `bun dev`) where node takes a script. */
const isSubcommand = (runtime: Family, t: string) =>
  (runtime === 'bun' || runtime === 'deno') && !t.includes('/') && !SCRIPT_EXT.test(t)

/** A path that holds spaces runs up to its script extension (`/Applications/X MCP.app/…/index.js`). */
const SPACED_SCRIPT = /^(\/.*?\.(?:c|m)?(?:js|ts)|\/.*?\.py)(?=\s|$)/

/** The script at `i` (joined with what follows when its path holds spaces), or a subcommand. */
function scriptAt(
  runtime: Family,
  tokens: string[],
  i: number,
): { entry?: string; rest: string[] } {
  if (isSubcommand(runtime, tokens[i])) return { rest: tokens.slice(i) }
  const entry = tokens.slice(i).join(' ').match(SPACED_SCRIPT)?.[1] ?? tokens[i]
  return { entry, rest: tokens.slice(i + entry.split(' ').length) }
}

/** A runtime's script and the tokens after it. */
function findEntry(runtime: Family, after: string): { entry?: string; rest: string[] } {
  const tokens = after.split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '-m') return { entry: tokens[i + 1], rest: tokens.slice(i + 2) }
    if (INLINE.has(t)) return { entry: '<inline>', rest: [] }
    if (!t.startsWith('-')) return scriptAt(runtime, tokens, i)
    if (TAKES_VALUE.has(t)) i++
  }
  return { rest: [] }
}

export function shapeOf(row: Pick<PsRow, 'exe' | 'args' | 'argsUnavailable' | 'zombie'>): Shape {
  const { exe } = row
  if (row.argsUnavailable || row.zombie)
    return { exe, argv0: exe, a0: exe, runtime: runtimeOf(exe), name: exe, rest: [] }
  const argv0 = argv0Of(row.args, exe)
  const a0 = basename(argv0).replace(/^-|:$/g, '') // `-zsh` (login shell), `ssh:` (mux)
  const runtime = runtimeOf(exe) ?? runtimeOf(a0)
  const after = row.args.slice(argv0.length)
  if (!runtime || !runtimeOf(a0)) {
    const title = runtime && !argv0.includes('/') ? row.args : undefined
    const rest = after.split(/\s+/).filter(Boolean)
    return { exe, argv0, a0, runtime, name: a0, rest, app: appOf(argv0), title }
  }
  const { entry, rest } = findEntry(runtime, after)
  const base = { exe, argv0, a0, runtime, entry, rest, app: appOf(entry) }
  if (!entry || entry === '<inline>') return { ...base, name: a0 }
  return { ...base, name: packageName(entry, basename(entry).replace(SCRIPT_EXT, '')) }
}
