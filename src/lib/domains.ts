import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Hosts that are never the project's own domain — placeholders, plus the code/package
 * hosts a `homepage` field usually points at (`*.github.io` pages still pass).
 */
const PLACEHOLDER_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'example.com',
  'yourdomain.com',
  'github.com',
  'www.github.com',
  'gitlab.com',
  'bitbucket.org',
  'npmjs.com',
  'www.npmjs.com',
  'pypi.org',
  'crates.io',
])
const PLACEHOLDER_SUFFIXES = ['.local', '.localhost', '.test', '.invalid']

/** HTML entry points checked for og:url / canonical, relative to the project root. */
const HTML_CANDIDATES = ['src/app.html', 'index.html', 'public/index.html', 'static/index.html']
const ROBOTS_CANDIDATES = ['static/robots.txt', 'public/robots.txt', 'robots.txt']
const ENV_CANDIDATES = ['.env', '.env.production', '.env.local']

/**
 * Env keys that hold the site's *own* public URL. Deliberately narrow —
 * generic names like BASE_URL usually point at a third-party API instead.
 */
const SITE_URL_KEY = /^(?:PUBLIC_|VITE_|NEXT_PUBLIC_|NUXT_PUBLIC_)?(?:SITE_URL|SITE_ORIGIN|ORIGIN)$/

/**
 * Normalize a URL, host or route pattern to a bare hostname.
 * Returns null when the value isn't a usable production domain.
 */
export function normalizeDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase()
  if (!value) return null

  value = value.replace(/^https?:\/\//, '')
  value = value.split(/[/?#]/)[0]
  value = value.replace(/^\*\./, '')
  value = value.replace(/:\d+$/, '')
  value = value.replace(/\.$/, '')

  if (!value.includes('.') || /[^a-z0-9.-]/.test(value)) return null
  if (PLACEHOLDER_HOSTS.has(value)) return null
  if (PLACEHOLDER_SUFFIXES.some((suffix) => value.endsWith(suffix))) return null

  return value
}

export function mergeDomains(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>()
  for (const list of lists) {
    for (const raw of list ?? []) {
      const domain = normalizeDomain(raw)
      if (domain) seen.add(domain)
    }
  }
  return [...seen]
}

/** Domains declared in an HTML document via og:url or <link rel="canonical">. */
export function extractHtmlDomains(content: string): string[] {
  const found: string[] = []

  for (const [tag] of content.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/(?:property|name)\s*=\s*["'](?:og:url)["']/i.test(tag)) continue
    const value = tag.match(/content\s*=\s*["']([^"']+)["']/i)
    if (value) found.push(value[1])
  }

  for (const [tag] of content.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']canonical["']/i.test(tag)) continue
    const value = tag.match(/href\s*=\s*["']([^"']+)["']/i)
    if (value) found.push(value[1])
  }

  return found
}

/** Custom domains from a wrangler config (routes / patterns, toml or json), plus the pages.dev default. */
function extractWranglerDomains(content: string): string[] {
  const found: string[] = []

  for (const [, value] of content.matchAll(
    /(?:route|pattern|custom_domain)\s*[:=]\s*["']([^"']+)["']/gi,
  )) {
    found.push(value)
  }

  // Cloudflare Pages projects always answer on <name>.pages.dev.
  if (/pages_build_output_dir/.test(content)) {
    const name = content.match(/^\s*"?name"?\s*[:=]\s*["']([^"']+)["']/m)
    if (name) found.push(`${name[1]}.pages.dev`)
  }

  const routesBlock = content.match(/routes\s*[:=]\s*\[([\s\S]*?)\]/i)
  if (routesBlock) {
    for (const [, value] of routesBlock[1].matchAll(/["']([^"']+)["']/g)) {
      found.push(value)
    }
  }

  return found
}

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Production domains a project publishes on, gathered from its own files:
 * CNAME, vercel aliases, wrangler routes, package.json homepage and HTML metadata.
 */
export async function detectDomains(
  fullPath: string,
  options: { homepage?: string } = {},
): Promise<string[]> {
  const found: string[] = []
  if (options.homepage) found.push(options.homepage)

  const cname = await readIfPresent(join(fullPath, 'CNAME'))
  if (cname) found.push(...cname.split('\n'))

  const vercel = await readIfPresent(join(fullPath, 'vercel.json'))
  if (vercel) {
    try {
      const { alias } = JSON.parse(vercel)
      if (typeof alias === 'string') found.push(alias)
      else if (Array.isArray(alias))
        found.push(...alias.filter((a): a is string => typeof a === 'string'))
    } catch {
      /* malformed vercel.json */
    }
  }

  // A linked Vercel project answers on <projectName>.vercel.app.
  const vercelLink = await readIfPresent(join(fullPath, '.vercel', 'project.json'))
  if (vercelLink) {
    try {
      const { projectName } = JSON.parse(vercelLink)
      if (typeof projectName === 'string') found.push(`${projectName}.vercel.app`)
    } catch {
      /* malformed project.json */
    }
  }

  for (const name of ['wrangler.toml', 'wrangler.jsonc', 'wrangler.json']) {
    const content = await readIfPresent(join(fullPath, name))
    if (content) found.push(...extractWranglerDomains(content))
  }

  for (const candidate of HTML_CANDIDATES) {
    const content = await readIfPresent(join(fullPath, candidate))
    if (content) found.push(...extractHtmlDomains(content))
  }

  for (const candidate of ROBOTS_CANDIDATES) {
    const content = await readIfPresent(join(fullPath, candidate))
    if (!content) continue
    for (const [, url] of content.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)) found.push(url)
  }

  for (const candidate of ENV_CANDIDATES) {
    const content = await readIfPresent(join(fullPath, candidate))
    if (!content) continue
    for (const [, key, url] of content.matchAll(
      /^\s*([A-Z0-9_]+)\s*=\s*["']?(https?:\/\/\S+?)["']?\s*$/gm,
    )) {
      if (SITE_URL_KEY.test(key)) found.push(url)
    }
  }

  return mergeDomains(found)
}
