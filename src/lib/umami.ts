import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, sep } from 'node:path'
import { promisify } from 'node:util'
import { extractHtmlDomains, mergeDomains } from './domains'

const execFileAsync = promisify(execFile)

export interface UmamiInfo {
  /** Umami website ids the project's tracking snippet(s) report to. */
  websiteIds: string[]
  /** Base URL of the Umami instance, e.g. https://umami-inky-two.vercel.app */
  instance?: string
}

/** ripgrep is resolved by absolute path too — launchd runs atlas-api without /opt/homebrew/bin on PATH. */
const RG_CANDIDATES = ['rg', '/opt/homebrew/bin/rg', '/usr/local/bin/rg']

const INCLUDE_GLOBS = ['*.html', '*.svelte', '*.astro', '*.vue', '*.tsx', '*.jsx', '*.ts', '*.js']
const EXCLUDE_GLOBS = [
  '!node_modules/**',
  '!dist/**',
  '!build/**',
  '!.svelte-kit/**',
  '!.next/**',
  '!out/**',
  '!target/**',
  '!coverage/**',
  '!.git/**',
  '!**/worktrees/**',
]

const MAX_TRACKED_FILES = 400
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** Website ids + instance URL from a file carrying an Umami tracking snippet. */
export function extractUmami(content: string): UmamiInfo {
  const websiteIds = new Set<string>()
  for (const [, id] of content.matchAll(
    new RegExp(`data-website-id[^0-9a-f]{0,20}(${UUID})`, 'gi'),
  )) {
    websiteIds.add(id.toLowerCase())
  }

  const src = content.match(/["'](https?:\/\/[^"'\s]+)\/(?:script|umami)\.js["']/i)

  return { websiteIds: [...websiteIds], instance: src?.[1] }
}

/** Files containing an Umami snippet, found in one ripgrep pass over the dev root. */
async function findTrackedFiles(baseDir: string): Promise<string[]> {
  const args = [
    '--files-with-matches',
    '--no-messages',
    ...INCLUDE_GLOBS.flatMap((g) => ['-g', g]),
    ...EXCLUDE_GLOBS.flatMap((g) => ['-g', g]),
    'data-website-id',
    baseDir,
  ]

  const toFiles = (stdout: string) => stdout.split('\n').filter(Boolean).slice(0, MAX_TRACKED_FILES)

  for (const bin of RG_CANDIDATES) {
    try {
      const { stdout } = await execFileAsync(bin, args, {
        timeout: 20_000,
        maxBuffer: 4 * 1024 * 1024,
      })
      return toFiles(stdout)
    } catch (err) {
      const { code, stdout } = err as { code?: number | string; stdout?: string }
      // 1 = no matches. 2 = ran but hit unreadable paths — the matches it did find are still on stdout.
      if (code === 1) return []
      if (stdout) return toFiles(stdout)
      // Binary missing or unusable — try the next candidate.
    }
  }

  console.warn('[umami] ripgrep not found — skipping website id detection')
  return []
}

interface UmamiTarget {
  umami?: UmamiInfo
  domains?: string[]
}

/** Find the project owning a file: the deepest project path that contains it. */
function ownerOf<T>(file: string, byPath: Map<string, T>): T | undefined {
  let dir = dirname(file)
  while (dir && dir !== sep) {
    const owner = byPath.get(dir)
    if (owner) return owner
    dir = dirname(dir)
  }
  return undefined
}

/**
 * Attach detected Umami website ids to their projects, and merge any domains
 * declared in the same file into the project's domain list.
 * Ids already present (from `.atlas`) are kept and listed first.
 */
export async function attachUmami(
  baseDir: string,
  projects: (UmamiTarget & { path: string })[],
): Promise<void> {
  const files = await findTrackedFiles(baseDir)
  if (files.length === 0) return

  const byPath = new Map(projects.map((p) => [p.path, p]))

  for (const file of files) {
    const project = ownerOf(file, byPath)
    if (!project) continue

    let content: string
    try {
      content = await readFile(file, 'utf-8')
    } catch {
      continue
    }

    const { websiteIds, instance } = extractUmami(content)
    if (websiteIds.length === 0) continue

    const existing = project.umami
    project.umami = {
      websiteIds: [...new Set([...(existing?.websiteIds ?? []), ...websiteIds])],
      instance: existing?.instance ?? instance,
    }

    if (file.endsWith('.html')) {
      const domains = mergeDomains(project.domains, extractHtmlDomains(content))
      if (domains.length > 0) project.domains = domains
    }
  }
}

/** Dashboard URL for a website id, when the instance is known. */
export function umamiDashboardUrl(umami: UmamiInfo, websiteId: string): string | undefined {
  return umami.instance ? `${umami.instance}/websites/${websiteId}` : undefined
}
