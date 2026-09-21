import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { DEV_FOLDER } from './config'
import { createMutex } from './mutex'

const REGISTRY_FILE = join(DEV_FOLDER, '.atlas-hostnames.json')
const ROOT_DOMAIN = 'jurrejan.com'
const SUBDOMAIN_LABEL = 'atlas'
const NAS_SITES_DIR = '/share/CACHEDEV1_DATA/Container/caddy/etc/sites'
const NAS_DOCKER = '/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker'
const SSH_TIMEOUT_MS = 8000

interface HostnameEntry {
  path: string
  port: number
  /** `.atlas` `devPublic` override — remote reachable with no password. Tracked so a flag
   *  flip with no port change still triggers a re-push. */
  devPublic?: boolean
  registeredAt: string
  nasSynced?: boolean
}

type Registry = Record<string, HostnameEntry>

export interface Hostnames {
  local: string
  remote: string
}

async function readRegistry(): Promise<Registry> {
  try {
    return JSON.parse(await readFile(REGISTRY_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

async function writeRegistry(registry: Registry): Promise<void> {
  await writeFile(REGISTRY_FILE, `${JSON.stringify(registry, null, 2)}\n`)
}

function hostnamesFor(slug: string): Hostnames {
  return {
    local: `https://${slug}.${SUBDOMAIN_LABEL}.local.${ROOT_DOMAIN}`,
    remote: `https://${slug}.${SUBDOMAIN_LABEL}.remote.${ROOT_DOMAIN}`,
  }
}

/** This machine's LAN IPv4 — resolved live so a DHCP-renewed address self-heals on the next run. */
function lanIp(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  throw new Error('caddyDev: no LAN IPv4 address found')
}

/**
 * `atlas.local` is gated by source IP, not a password — DNS can't point it at a private address
 * on this network (the household router silently drops answers containing RFC1918 IPs, a
 * DNS-rebinding protection), so it resolves to the NAS's public IP like `atlas.remote` and
 * relies on `admin_ip_check` (from `snippets/common.caddy`) instead: LAN CIDR *and* the
 * household's own public IP, since hairpin NAT can make a LAN-originated request look like the
 * latter to the container. `atlas.remote` is gated by the shared `CADDY_DEV_AUTH_HASH` password
 * (bcrypt, generated once via the NAS's own `caddy hash-password`) — unless `devPublic` opts the
 * project out via its `.atlas` file, for something meant to be shared with no password at all.
 */
function renderSiteBlock(slug: string, port: number, ip: string, devPublic: boolean): string {
  // Vite (and anything built on it) has its own Host-header allowlist independent of
  // `--host`/bind address, and rejects a proxied Host it doesn't recognize with a 403 —
  // rewriting it to `localhost` here means no per-project vite.config changes are needed.
  const proxy = (indent: string) =>
    [
      `${indent}reverse_proxy ${ip}:${port} {`,
      `${indent}\theader_up Host localhost`,
      `${indent}}`,
    ].join('\n')

  const local = [
    `${slug}.${SUBDOMAIN_LABEL}.local.${ROOT_DOMAIN} {`,
    `\timport admin_ip_check`,
    `\thandle @admin_ips {`,
    proxy('\t\t'),
    `\t}`,
    `\thandle @not_admin {`,
    `\t\trespond 403`,
    `\t}`,
    `}`,
  ].join('\n')

  const authHash = process.env.CADDY_DEV_AUTH_HASH
  if (!authHash) return `${local}\n`

  const authUser = process.env.CADDY_DEV_AUTH_USER ?? 'dev'
  const remote = [
    `${slug}.${SUBDOMAIN_LABEL}.remote.${ROOT_DOMAIN} {`,
    ...(devPublic ? [] : [`\tbasic_auth {`, `\t\t${authUser} ${authHash}`, `\t}`]),
    proxy('\t'),
    `}`,
  ].join('\n')

  return `${local}\n\n${remote}\n`
}

function runSsh(script: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('ssh', ['nas', 'bash', '-s'], { stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve({ ok: false, output: `${output}\n(timed out after ${SSH_TIMEOUT_MS}ms)` })
    }, SSH_TIMEOUT_MS)

    child.stdout.on('data', (d) => {
      output += d
    })
    child.stderr.on('data', (d) => {
      output += d
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ ok: code === 0, output })
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ ok: false, output: err.message })
    })
    child.stdin.write(script)
    child.stdin.end()
  })
}

const validateAndReload = `${NAS_DOCKER} exec caddy-porkbun caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
${NAS_DOCKER} exec caddy-porkbun caddy reload --config /etc/caddy/Caddyfile --address localhost:2019`

/** Writes `<slug>-atlas.caddy` into the NAS's `etc/sites/` (auto-imported), then validates + reloads. */
async function pushToNas(slug: string, content: string): Promise<boolean> {
  const remotePath = `${NAS_SITES_DIR}/${slug}-atlas.caddy`
  const script = `set -eu
cat > '${remotePath}' <<'ATLAS_CADDY_EOF'
${content}
ATLAS_CADDY_EOF
${validateAndReload}
`
  const { ok, output } = await runSsh(script)
  if (!ok) console.warn(`caddyDev: NAS push failed for ${slug} — ${output.trim()}`)
  return ok
}

async function removeFromNas(slug: string): Promise<boolean> {
  const remotePath = `${NAS_SITES_DIR}/${slug}-atlas.caddy`
  const script = `set -eu
rm -f '${remotePath}'
${validateAndReload}
`
  const { ok, output } = await runSsh(script)
  if (!ok) console.warn(`caddyDev: NAS remove failed for ${slug} — ${output.trim()}`)
  return ok
}

// Registry read-modify-write isn't atomic (plain readFile/writeFile), so two concurrent
// ensureRoute/removeRoute calls could drop one entry entirely. Serializing them is cheap —
// registrations are rare, human-triggered events, never a hot path.
const withRegistryLock = createMutex()

/**
 * Registers `project`'s dev hostnames. Only pushes to the NAS (an SSH round-trip + a reload
 * of a shared, production Caddy instance) when something actually changed — a new project or
 * a changed port — or the last push never confirmed success; a repeat `atlas run` with an
 * already-synced port is a local no-op. Best-effort: an unreachable NAS (offline, off-LAN)
 * fails soft and callers fall back to the plain `localhost:<port>` URL instead of a hostname
 * that won't resolve.
 */
export function ensureRoute(project: {
  slug: string
  path: string
  port: number
  devPublic?: boolean
}): Promise<Hostnames | null> {
  const devPublic = project.devPublic ?? false
  return withRegistryLock(async () => {
    const registry = await readRegistry()
    const existing = registry[project.slug]

    if (
      existing?.port === project.port &&
      (existing.devPublic ?? false) === devPublic &&
      existing.nasSynced
    ) {
      return hostnamesFor(project.slug)
    }

    const content = renderSiteBlock(project.slug, project.port, lanIp(), devPublic)
    const synced = await pushToNas(project.slug, content)

    registry[project.slug] = {
      path: project.path,
      port: project.port,
      devPublic,
      registeredAt: existing?.registeredAt ?? new Date().toISOString(),
      nasSynced: synced,
    }
    await writeRegistry(registry)

    return synced ? hostnamesFor(project.slug) : null
  })
}

/** Drops `slug`'s route from the NAS and the registry. No-op if unregistered. */
export function removeRoute(slug: string): Promise<void> {
  return withRegistryLock(async () => {
    const registry = await readRegistry()
    if (!(slug in registry)) return

    await removeFromNas(slug)
    delete registry[slug]
    await writeRegistry(registry)
  })
}

/** Same as {@link removeRoute}, keyed by project path instead of slug (for the archive route). */
export async function removeRouteByPath(path: string): Promise<void> {
  const registry = await readRegistry()
  const slug = Object.keys(registry).find((s) => registry[s].path === path)
  if (slug) await removeRoute(slug)
}

export async function listHostnames(): Promise<
  { slug: string; path: string; local: string; remote: string }[]
> {
  const registry = await readRegistry()
  return Object.entries(registry)
    .filter(([, entry]) => entry.nasSynced)
    .map(([slug, entry]) => ({
      slug,
      path: entry.path,
      ...hostnamesFor(slug),
    }))
}
