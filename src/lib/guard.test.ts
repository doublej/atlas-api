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
    '/api/ports/kill',
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
  ['HEAD off-LAN', 'HEAD', '/api/health', via(REMOTE)],
  ['secret read on the LAN, no Origin', 'GET', '/api/env-files', via(LAN)],
  ['secret read on this Mac', 'GET', '/api/claude-tree', { host: 'localhost:47891' }],
  [
    'URL typed into the address bar',
    'GET',
    '/api/env-files',
    { host: 'localhost:47891', 'sec-fetch-site': 'none' },
  ],
  [
    'Raycast scans its own scanDirs',
    'GET',
    '/api/projects?dir=/Users/jurrejan/dev',
    { host: 'localhost:47891', 'sec-fetch-mode': 'cors' },
  ],
  // A GET outside the local-only list is not checked at all — reads stay open.
  ['GET from a rebinding Host', 'GET', '/api/projects', { host: 'evil.example' }],
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
    '/api/ports/kill',
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
  ['off-LAN process argv', 'GET', '/api/ports/listeners', via(REMOTE), /off-LAN/],
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
