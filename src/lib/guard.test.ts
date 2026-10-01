import { describe, expect, it } from 'vitest'
import { refusal } from './guard'

const LAN = 'atlas.jurrejan.com'
const LAN_LONG = 'atlas.atlas.local.jurrejan.com'
const REMOTE = 'atlas.atlas.remote.jurrejan.com'
/** What the NAS Caddy sends on: Host rewritten, the client's IP and the hostname it asked for. */
const via = (host: string, origin?: string) => ({
  host: 'localhost',
  'x-forwarded-for': '192.168.178.20',
  'x-forwarded-host': host,
  ...(origin ? { origin } : {}),
})
/** A rebound page: its own name as `Host`, plus the forwarded headers it can add like any other. */
const rebound = (host: string, origin?: string) => ({ ...via(host, origin), host: 'evil.example' })

type Case = [name: string, method: string, route: string, headers: Record<string, string>]

/** `route` is a route id, optionally with the request's query (`/api/projects?dir=…`). */
const check = (method: string, route: string, headers: Record<string, string>) => {
  const [id, search] = route.split('?')
  return refusal(method, id, new Headers(headers), new URLSearchParams(search))
}

const allowed: Case[] = [
  ['atlas-cli (Bun fetch, no Origin)', 'POST', '/api/refresh', { host: 'localhost:47891' }],
  ['Raycast (Node fetch, no Origin)', 'POST', '/api/iterm', { host: 'localhost:47891' }],
  ['atlas-picker (ureq, no Origin)', 'POST', '/api/git', { host: 'localhost:47891' }],
  ['curl on 127.0.0.1', 'PUT', '/api/config', { host: '127.0.0.1:47891' }],
  ['IPv6 loopback', 'POST', '/api/refresh', { host: '[::1]:47891', origin: 'http://[::1]:47891' }],
  [
    'console at http://127.0.0.1:47891',
    'POST',
    '/api/processes/stop',
    { host: '127.0.0.1:47891', origin: 'http://127.0.0.1:47891' },
  ],
  [
    'console at http://localhost:47891',
    'DELETE',
    '/api/disk/jobs/[id]',
    { host: 'localhost:47891', origin: 'http://localhost:47891' },
  ],
  ['console via https://atlas.jurrejan.com', 'POST', '/api/finder', via(LAN, `https://${LAN}`)],
  ['console via atlas.local', 'PUT', '/api/disk/config', via(LAN_LONG, `https://${LAN_LONG}`)],
  ['GET off-LAN', 'GET', '/api/projects', via(REMOTE)],
  ['redacted process list off-LAN', 'GET', '/api/processes', via(REMOTE)],
  ['redacted listeners off-LAN', 'GET', '/api/ports/listeners', via(REMOTE)],
  ['HEAD off-LAN', 'HEAD', '/api/health', via(REMOTE)],
  ['secret read on the LAN, no Origin', 'GET', '/api/env-files', via(LAN)],
  ['file read via atlas.local', 'GET', '/api/claude-tree', via(LAN_LONG)],
  ['secret read on this Mac', 'GET', '/api/claude-tree', { host: 'localhost:47891' }],
  [
    'URL typed into the address bar',
    'GET',
    '/api/env-files',
    { host: 'localhost:47891', 'sec-fetch-site': 'none' },
  ],
  ['atlas-cli reads the catalog', 'GET', '/api/projects', { host: 'localhost:47891' }],
  [
    'Raycast reads the catalog (Node fetch: Sec-Fetch-Mode only)',
    'GET',
    '/api/projects',
    { host: 'localhost:47891', 'sec-fetch-mode': 'cors' },
  ],
  [
    'console reads the catalog',
    'GET',
    '/api/projects',
    { host: '127.0.0.1:47891', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
  ],
  [
    'a link on another site opens the catalog',
    'GET',
    '/api/projects',
    { host: 'localhost:47891', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' },
  ],
  [
    'a link on another site opens a page',
    'GET',
    '/processes',
    { host: 'localhost:47891', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' },
  ],
  [
    "a page's own data load",
    'GET',
    '/processes',
    { host: 'localhost:47891', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
  ],
  [
    "a page's own data load on the LAN",
    'GET',
    '/processes',
    { ...via(LAN), 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
  ],
  [
    'a page off-LAN',
    'GET',
    '/',
    { ...via(REMOTE), 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate' },
  ],
  [
    'Raycast scans its own scanDirs',
    'GET',
    '/api/projects?dir=/Users/jurrejan/dev',
    { host: 'localhost:47891', 'sec-fetch-mode': 'cors' },
  ],
]

const refused: [...Case, reason: RegExp][] = [
  [
    'CSRF: page on another site posts to loopback',
    'POST',
    '/api/refresh',
    { host: 'localhost:47891', origin: 'https://evil.example' },
    /cross-site request from https:\/\/evil\.example/,
  ],
  [
    'CSRF: page on another localhost port posts to the daemon',
    'POST',
    '/api/services',
    { host: 'localhost:47891', origin: 'http://localhost:5173' },
    /cross-site request from http:\/\/localhost:5173/,
  ],
  [
    'CSRF: sandboxed frame sends Origin null',
    'POST',
    '/api/iterm',
    { host: '127.0.0.1:47891', origin: 'null' },
    /cross-site/,
  ],
  [
    'DNS rebinding: Host evil.example',
    'POST',
    '/api/processes/stop',
    { host: 'evil.example:47891', origin: 'http://evil.example:47891' },
    /host evil\.example:47891 is not this Mac/,
  ],
  [
    'DNS rebinding reads a secret',
    'GET',
    '/api/env-files',
    { host: 'evil.example' },
    /not this Mac/,
  ],
  ['no Host at all', 'POST', '/api/refresh', {}, /host \(none\)/],
  [
    "another site's script reads the catalog",
    'GET',
    '/api/projects',
    {
      host: 'localhost:47891',
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'cors',
    },
    /cross-site request from https:\/\/evil\.example/,
  ],
  [
    "another site's <img> runs a fresh process snapshot",
    'GET',
    '/api/processes',
    { host: 'localhost:47891', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' },
    /Sec-Fetch-Site: cross-site/,
  ],
  [
    "another site's <img> runs the hostname doctor",
    'GET',
    '/api/hostnames/doctor',
    { host: 'localhost:47891', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' },
    /Sec-Fetch-Site: cross-site/,
  ],
  [
    "another site's script reads a page's data",
    'GET',
    '/processes',
    { host: 'localhost:47891', origin: 'https://evil.example', 'sec-fetch-mode': 'cors' },
    /cross-site request from https:\/\/evil\.example/,
  ],
  [
    'a dev hostname (same site) reads the catalog on the LAN',
    'GET',
    '/api/projects',
    { ...via(LAN), origin: 'https://web.atlas.local.jurrejan.com', 'sec-fetch-site': 'same-site' },
    /cross-site request from https:\/\/web\.atlas\.local/,
  ],
  [
    'another site reads the catalog off-LAN',
    'GET',
    '/api/projects',
    { ...via(REMOTE), 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' },
    /Sec-Fetch-Site: cross-site/,
  ],
  [
    'DNS rebinding reads the catalog',
    'GET',
    '/api/projects',
    { host: 'evil.example' },
    /not this Mac/,
  ],
  [
    'rebinding + forged LAN headers read a secret',
    'GET',
    '/api/env-files',
    rebound(LAN),
    /not this Mac/,
  ],
  [
    'rebinding + forged LAN headers read a file',
    'GET',
    '/api/claude-tree',
    rebound(LAN_LONG),
    /not this Mac/,
  ],
  [
    'rebinding + forged LAN headers read a log',
    'GET',
    '/api/processes/log',
    rebound(LAN),
    /not this Mac/,
  ],
  [
    'rebinding + forged LAN headers read CLAUDE.md',
    'GET',
    '/api/agent-files',
    rebound(LAN),
    /not this Mac/,
  ],
  [
    'rebinding + forged off-LAN headers read processes',
    'GET',
    '/api/processes',
    rebound(REMOTE),
    /not this Mac/,
  ],
  [
    'rebinding + forged LAN headers write',
    'POST',
    '/api/processes/stop',
    rebound(LAN, `https://${LAN}`),
    /host evil\.example is not this Mac/,
  ],
  [
    'CSRF: <img> on another site scans a folder (no Origin)',
    'GET',
    '/api/projects?dir=/Users/jurrejan',
    { host: 'localhost:47891', 'sec-fetch-site': 'cross-site' },
    /Sec-Fetch-Site: cross-site/,
  ],
  [
    'DNS rebinding scans a folder',
    'GET',
    '/api/projects?dir=/tmp',
    { host: 'evil.example', origin: 'https://evil.example' },
    /not this Mac/,
  ],
  [
    'LAN browser on another site scans a folder',
    'GET',
    '/api/projects?dir=/Users/jurrejan',
    via(LAN, 'https://evil.example'),
    /cross-site request from https:\/\/evil\.example/,
  ],
  ['off-LAN folder scan', 'GET', '/api/projects?dir=/tmp', via(REMOTE), /^not available off-LAN$/],
  [
    'off-LAN write',
    'POST',
    '/api/refresh',
    via(REMOTE, `https://${REMOTE}`),
    /^read-only off-LAN$/,
  ],
  ['off-LAN secret read', 'GET', '/api/env-files', via(REMOTE), /^not available off-LAN$/],
  ['off-LAN file read', 'GET', '/api/claude-tree', via(REMOTE), /^not available off-LAN$/],
  ['off-LAN CLAUDE.md read', 'GET', '/api/agent-files', via(REMOTE), /off-LAN/],
  ['off-LAN port reservation', 'GET', '/api/ports/allocate', via(REMOTE), /off-LAN/],
  ['off-LAN dev server log', 'GET', '/api/processes/log', via(REMOTE), /off-LAN/],
  ['off-LAN stop', 'POST', '/api/processes/stop', via(REMOTE, `https://${REMOTE}`), /off-LAN/],
  ['off-LAN screen action', 'POST', '/api/iterm', via(REMOTE, `https://${REMOTE}`), /off-LAN/],
  ['LAN write without Origin', 'POST', '/api/refresh', via(LAN), /needs Origin.*got none/],
  [
    'LAN write with another LAN host as Origin',
    'POST',
    '/api/refresh',
    via(LAN_LONG, `https://${LAN}`),
    /needs Origin https:\/\/atlas\.atlas\.local/,
  ],
  [
    'LAN write from another site',
    'PUT',
    '/api/hosts',
    via(LAN, 'https://evil.example'),
    /needs Origin/,
  ],
  [
    "a project's dev hostname",
    'POST',
    '/api/refresh',
    via('web.atlas.local.jurrejan.com', 'https://web.atlas.local.jurrejan.com'),
    /unknown forwarded host web\.atlas\.local/,
  ],
  [
    "a project's dev hostname reads a journal",
    'GET',
    '/api/agent-log',
    via('atlas-api.atlas.remote.jurrejan.com'),
    /unknown forwarded host atlas-api\.atlas\.remote/,
  ],
  [
    'forwarded without a host',
    'POST',
    '/api/refresh',
    { host: 'localhost', 'x-forwarded-for': '1.2.3.4' },
    /unknown forwarded host \(none\)/,
  ],
]

describe('refusal', () => {
  it.each(allowed)('lets through: %s', (_, method, route, headers) => {
    expect(check(method, route, headers)).toBeNull()
  })
  it.each(refused)('refuses: %s', (_, method, route, headers, reason) => {
    expect(check(method, route, headers)).toMatch(reason)
  })
  it('covers every route under a local-only id', () => {
    expect(check('POST', '/api/claude-tree/agent', via(REMOTE))).toBe('read-only off-LAN')
    expect(check('GET', '/api/env-filesx', via(REMOTE))).toBeNull()
    expect(check('GET', '/api/projects?dir=', via(REMOTE))).toBeNull()
  })
})
