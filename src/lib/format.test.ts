import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { errorMessage, localDateTime, tildify } from './format'

describe('errorMessage', () => {
  it('reads an Error and stringifies anything else', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
    expect(errorMessage('plain')).toBe('plain')
    expect(errorMessage(42)).toBe('42')
  })
})

describe('tildify', () => {
  it('collapses a /Users/<name> home at a path boundary', () => {
    expect(tildify('/Users/jj')).toBe('~')
    expect(tildify('/Users/jj/dev/atlas')).toBe('~/dev/atlas')
  })
  it('leaves everything else alone', () => {
    expect(tildify('/Users/Shared/x')).toBe('/Users/Shared/x')
    expect(tildify('/opt/homebrew')).toBe('/opt/homebrew')
    expect(tildify('/Users')).toBe('/Users')
    expect(tildify('relative/Users/jj')).toBe('relative/Users/jj')
    expect(tildify('')).toBe('')
  })
  it.runIf(process.platform === 'darwin')('matches the real $HOME on the server', () => {
    expect(tildify(join(homedir(), 'dev'))).toBe('~/dev')
  })
})

describe('localDateTime', () => {
  it('reads exactly like Date#toLocaleString', () => {
    for (const v of ['2026-10-14T13:08:25.158Z', '2001-01-02T00:00:00Z', 0]) {
      expect(localDateTime(v)).toBe(new Date(v).toLocaleString())
    }
  })
})
