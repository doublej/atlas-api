import { describe, expect, it } from 'vitest'
import { checkArgs, ID, isQuickWrite, isRead, requireLocalRequest, withConfirmed } from './disk'

const status = (fn: () => void) => {
  try {
    fn()
    return 200
  } catch (e) {
    return (e as { status: number }).status
  }
}

describe('checkArgs', () => {
  it('accepts the commands the page sends', () => {
    for (const [cmd, args] of [
      [
        'archive',
        ['web/app', 'web/old-site', '--compression', 'fast', '--confirm-dirty', 'web/app'],
      ],
      ['restore', ['web/app@20260921-101500', '--keep-archive']],
      ['archives', ['prune', '--keep', '2']],
      ['clean', ['/Users/x/dev/web/app/dist', '--trash']],
      ['schedule', ['set', 'scan', '--at', 'Sun 10:00']],
      ['recover', ['undo', '20260921-101500-a1b2c3']],
      ['log', ['note', '--', 'emptied the Trash']],
      ['config', ['set', 'skipCategories', '_archive,_life']],
    ] as const)
      expect(status(() => checkArgs(cmd, [...args]))).toBe(200)
  })

  it('refuses unknown commands, flags, verbs and injected flags', () => {
    expect(status(() => checkArgs('rm', []))).toBe(400)
    expect(status(() => checkArgs('archive', ['web/app', '--unattended']))).toBe(400)
    expect(status(() => checkArgs('archive', ['web/app', '--include-dirty']))).toBe(400)
    expect(status(() => checkArgs('archives', ['nuke']))).toBe(400)
    expect(status(() => checkArgs('clean', ['relative/path']))).toBe(400)
    expect(status(() => checkArgs('recover', ['finish', '../x']))).toBe(400)
    expect(status(() => checkArgs('log', ['note', '--', 'a', 'b']))).toBe(400)
  })

  it('ids are <category>/<project>, optionally @version', () => {
    expect(ID.test('web/app')).toBe(true)
    expect(ID.test('web/app@20260921-101500')).toBe(true)
    expect(ID.test('web')).toBe(false)
    expect(ID.test('../etc/passwd')).toBe(false)
    expect(ID.test('web/app;rm')).toBe(false)
  })
})

describe('read or write', () => {
  it('reads are cached, listings, status and dry-runs', () => {
    expect(isRead('analyze', ['--cached'])).toBe(true)
    expect(isRead('analyze', [])).toBe(false)
    expect(isRead('archive', ['web/app', '--dry-run'])).toBe(true)
    expect(isRead('archive', ['web/app'])).toBe(false)
    expect(isRead('archives', ['contents', 'web/app@1'])).toBe(true)
    expect(isRead('archives', ['delete', 'web/app@1'])).toBe(false)
    expect(isRead('log', ['--pending'])).toBe(true)
    expect(isRead('log', ['--limit', '300', '--op', 'trim'])).toBe(true)
    expect(isRead('log', ['note', '--', 'x'])).toBe(false)
    expect(isQuickWrite('config', ['set', 'a', 'b'])).toBe(true)
    expect(isQuickWrite('config', ['get'])).toBe(false)
  })

  it('--confirmed goes before the free-text separator', () => {
    expect(withConfirmed(['web/app'])).toEqual(['web/app', '--confirmed'])
    expect(withConfirmed(['note', '--', 'x'])).toEqual(['note', '--confirmed', '--', 'x'])
  })
})

describe('requireLocalRequest', () => {
  const req = (headers: Record<string, string>) =>
    new Request('http://localhost:47891/api/disk/jobs', { method: 'POST', headers })
  it('allows this Mac', () => {
    expect(status(() => requireLocalRequest(req({ host: 'localhost:47891' })))).toBe(200)
    expect(
      status(() =>
        requireLocalRequest(req({ host: '127.0.0.1:47891', origin: 'http://127.0.0.1:47891' })),
      ),
    ).toBe(200)
  })
  it('allows the console LAN hostnames through the NAS proxy', () => {
    const short = {
      host: 'localhost',
      'x-forwarded-for': '1.2.3.4',
      'x-forwarded-host': 'atlas.jurrejan.com',
    }
    expect(
      status(() => requireLocalRequest(req({ ...short, origin: 'https://atlas.jurrejan.com' }))),
    ).toBe(200)
    const lan = 'atlas.atlas.local.jurrejan.com'
    const proxied = { host: 'localhost', 'x-forwarded-for': '192.168.1.2', 'x-forwarded-host': lan }
    expect(status(() => requireLocalRequest(req(proxied)))).toBe(200)
    expect(status(() => requireLocalRequest(req({ ...proxied, origin: `https://${lan}` })))).toBe(
      200,
    )
    expect(
      status(() => requireLocalRequest(req({ ...proxied, origin: 'https://evil.example' }))),
    ).toBe(403)
    expect(
      status(() =>
        requireLocalRequest(
          req({ ...proxied, 'x-forwarded-host': 'atlas.atlas.remote.jurrejan.com' }),
        ),
      ),
    ).toBe(403)
  })
  it('refuses the NAS proxy, other hosts and other origins', () => {
    expect(
      status(() =>
        requireLocalRequest(req({ host: 'localhost:47891', 'x-forwarded-for': '192.168.1.2' })),
      ),
    ).toBe(403)
    expect(status(() => requireLocalRequest(req({ host: 'atlas.atlas.local.jurrejan.com' })))).toBe(
      403,
    )
    expect(
      status(() =>
        requireLocalRequest(req({ host: 'localhost:47891', origin: 'https://evil.example' })),
      ),
    ).toBe(403)
  })
})
