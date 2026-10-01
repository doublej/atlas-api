import { spawn } from 'node:child_process'
import { slugProblem } from './slug'

const NAS_ETC = '/share/CACHEDEV1_DATA/Container/caddy/etc'
const NAS_SITES_DIR = `${NAS_ETC}/sites`
const NAS_DOCKER = '/share/CACHEDEV1_DATA/.qpkg/container-station/bin/docker'
const SSH_TIMEOUT_MS = 8000
/** The DNS-01 wildcard pair (nas.md §2). Deliberately not `*-atlas.caddy`, the slug namespace. */
export const WILDCARD_FILE = 'atlas-wildcard.caddy'

export interface SiteBlock {
  slug: string
  port: number
  ip: string
  /** No password on the remote half. */
  devPublic: boolean
  /** Write the remote half at all (also needs `authHash`). */
  remote: boolean
  /** The remote half's bcrypt password hash (`authHashFor`). None, no remote half. */
  authHash?: string
  /** A service's own short LAN name, served next to `<slug>.atlas.local`. */
  host?: string
  /** `encode zstd gzip` — service blocks only: the console's HTML is 1.4 MB, while a dev server's
   *  bytes aren't worth the Celeron's time. */
  compress?: boolean
}

/**
 * `atlas.local` is gated by source IP, not a password — DNS can't point it at a private address
 * on this network (the household router silently drops answers containing RFC1918 IPs, a
 * DNS-rebinding protection), so it resolves to the NAS's public IP like `atlas.remote` and
 * relies on `admin_ip_check` (from `snippets/common.caddy`) instead: LAN CIDR *and* the
 * household's own public IP, since hairpin NAT can make a LAN-originated request look like the
 * latter to the container. `atlas.remote` is gated by a bcrypt password hash: the shared
 * `CADDY_DEV_AUTH_HASH` for projects, `CADDY_SERVICE_AUTH_HASH` for services (both from onenv
 * `caddy-dev`) — unless `devPublic` opts a project out via its `.atlas` file, for something meant
 * to be shared with no password at all.
 * No `tls` line: the `*.atlas.local` / `*.atlas.remote` wildcards in `atlas-wildcard.caddy`
 * cover every slug, so a new hostname costs no certificate.
 */
export function renderSiteBlock(b: SiteBlock): string {
  // Vite (and anything built on it) has its own Host-header allowlist independent of
  // `--host`/bind address, and rejects a proxied Host it doesn't recognize with a 403 —
  // rewriting it to `localhost` here means no per-project vite.config changes are needed.
  const proxy = (indent: string) =>
    [
      `${indent}reverse_proxy ${b.ip}:${b.port} {`,
      `${indent}\theader_up Host localhost`,
      `${indent}}`,
    ].join('\n')
  const encode = b.compress ? ['\tencode zstd gzip'] : []

  const local = [
    `${b.host ? `${b.host}, ` : ''}${b.slug}.atlas.local.jurrejan.com {`,
    ...encode,
    `\timport admin_ip_check`,
    `\thandle @admin_ips {`,
    proxy('\t\t'),
    `\t}`,
    `\thandle @not_admin {`,
    `\t\trespond 403`,
    `\t}`,
    `}`,
  ].join('\n')

  if (!b.authHash || !b.remote) return `${local}\n`

  const authUser = process.env.CADDY_DEV_AUTH_USER ?? 'dev'
  const remote = [
    `${b.slug}.atlas.remote.jurrejan.com {`,
    ...encode,
    ...(b.devPublic ? [] : [`\tbasic_auth {`, `\t\t${authUser} ${b.authHash}`, `\t}`]),
    proxy('\t'),
    `}`,
  ].join('\n')

  return `${local}\n\n${remote}\n`
}

/** Never let a bcrypt hash out of this module, not even inside a caddy error line. */
const redact = (text: string): string =>
  text.replace(/\$2[abxy]?\$\d+\$[./A-Za-z0-9]{20,}/g, '<hash>')

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

export interface NasResult {
  ok: boolean
  /** The last line of the failure, hash-free. */
  error?: string
}

async function runChange(what: string, script: string): Promise<NasResult> {
  const { ok, output } = await runSsh(script)
  if (ok) return { ok }
  const text = redact(output.trim())
  console.warn(`caddyDev: ${what} failed — ${text}`)
  return { ok, error: text.split('\n').at(-1)?.slice(0, 240) || 'ssh nas failed' }
}

const validate = `${NAS_DOCKER} exec caddy-porkbun caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`
const reload = `${NAS_DOCKER} exec caddy-porkbun caddy reload --config /etc/caddy/Caddyfile --address localhost:2019`

/** A slug is pasted into a remote shell line: one that is no DNS label never gets that far. */
function assertSlug(slug: string): void {
  const problem = slugProblem(slug)
  if (problem) throw new Error(`NAS change refused for ${JSON.stringify(slug)}: ${problem}`)
}

/**
 * Writes `<slug>-atlas.caddy` into the NAS's `etc/sites/` (auto-imported), then validates + reloads.
 * A block `caddy validate` rejects is rolled back to the previous file (kept in `etc/`, outside
 * the import), or removed: left in `sites/` it fails every later push and a Caddy restart.
 */
export function pushToNas(slug: string, content: string): Promise<NasResult> {
  assertSlug(slug)
  return runChange(
    `NAS push for ${slug}`,
    `set -eu
f='${NAS_SITES_DIR}/${slug}-atlas.caddy'
b='${NAS_ETC}/${slug}-atlas.caddy.prev'
if [ -f "$f" ]; then cp "$f" "$b"; else rm -f "$b"; fi
cat > "$f" <<'ATLAS_CADDY_EOF'
${content}
ATLAS_CADDY_EOF
if ! ${validate}; then
  if [ -f "$b" ]; then mv "$b" "$f"; else rm -f "$f"; fi
  exit 1
fi
rm -f "$b"
${reload}
`,
  )
}

export function removeFromNas(slug: string): Promise<NasResult> {
  assertSlug(slug)
  return runChange(
    `NAS remove for ${slug}`,
    `set -eu
rm -f '${NAS_SITES_DIR}/${slug}-atlas.caddy'
${validate}
${reload}
`,
  )
}

/** One NAS site file that serves an atlas or legacy `.dev.` hostname, reduced to what the doctor compares. */
export interface NasSite {
  file: string
  /** Site address lines (`a.atlas.local.jurrejan.com, b {` → both names). */
  hosts: string[]
  /** `reverse_proxy` targets, `ip:port`. */
  upstreams: string[]
}

export interface NasView {
  sites: NasSite[]
  /** The `remote_ip` entries of `(admin_ranges)` — compared in memory, never returned or logged. */
  adminRanges: string[]
}

/**
 * The NAS side of the doctor in one ssh round-trip. Only address and `reverse_proxy` lines leave
 * the NAS — a `basic_auth` hash line never matches either pattern.
 */
export async function readNas(): Promise<NasView | null> {
  const { ok, output } = await runSsh(`cd '${NAS_ETC}'
for f in sites/*.caddy; do
  grep -q -E '\\.(atlas|dev)\\.(local|remote)\\.jurrejan\\.com' "$f" || continue
  echo "@@FILE \${f#sites/}"
  grep -E '^[^[:space:]#].*\\{[[:space:]]*$|reverse_proxy' "$f"
done
echo "@@ADMIN"
grep -A3 '^(admin_ranges)' snippets/common.caddy
`)
  if (!ok) {
    console.warn('caddyDev: NAS read for the hostname doctor failed')
    return null
  }
  return parseNas(output)
}

const adminEntries = (line: string): string[] =>
  line
    .match(/^\s*remote_ip\s+(.+)$/)?.[1]
    .trim()
    .split(/\s+/) ?? []

function addSiteLine(site: NasSite, line: string): void {
  const proxy = line.match(/reverse_proxy\s+(\S+)/)
  if (proxy) site.upstreams.push(proxy[1])
  else
    site.hosts.push(
      ...line
        .replace(/\{\s*$/, '')
        .split(/[\s,]+/)
        .filter(Boolean),
    )
}

/** Pure: `readNas`'s output. */
export function parseNas(output: string): NasView {
  const sites: NasSite[] = []
  const adminRanges: string[] = []
  let section: 'site' | 'admin' | null = null
  for (const line of output.split('\n')) {
    if (line.startsWith('@@FILE ')) {
      sites.push({ file: line.slice(7).trim(), hosts: [], upstreams: [] })
      section = 'site'
    } else if (line === '@@ADMIN') section = 'admin'
    else if (section === 'admin') adminRanges.push(...adminEntries(line))
    else if (section === 'site') addSiteLine(sites[sites.length - 1], line)
  }
  return { sites, adminRanges }
}
