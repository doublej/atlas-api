import { describe, expect, it } from 'vitest'
import { checkArgs, ID, isQuickWrite, isRead, withConfirmed } from './disk'

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
