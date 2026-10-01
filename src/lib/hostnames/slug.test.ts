import { describe, expect, it } from 'vitest'
import { slugify } from '../scanner'
import { slugProblem } from './slug'

describe('slugProblem', () => {
  it.each(['a', 'web-eink', '0', 'a1-b2', 'x'.repeat(63)])('accepts %s', (slug) => {
    expect(slugProblem(slug)).toBeNull()
    expect(slugify(slug)).toBe(slug) // the slug checked is the slug routed
  })

  it.each([
    ['', 'empty'],
    ['x'.repeat(64), 'max 63'],
    ['Web', 'a-z'],
    ['a_b', 'a-z'],
    ['a.b', 'a-z'],
    ['-a', 'start or end'],
    ['a-', 'start or end'],
    ['a--b', '--'],
    ['xn--abc', '--'],
  ])('refuses %j (%s)', (slug, why) => {
    expect(slugProblem(slug)).toContain(why)
  })

  it('refuses a non-string', () => {
    expect(slugProblem(42)).toBe('slug is empty')
  })
})

describe('slugify', () => {
  it('kebab-cases a relative path', () => {
    expect(slugify('_sandbox/My App')).toBe('sandbox-my-app')
  })

  it('never yields an empty slug', () => {
    expect(slugify('___')).toBe('project')
  })

  it('cuts at 63 without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(62)}/b`)
    expect(slug).toBe('a'.repeat(62))
    expect(slugProblem(slug)).toBeNull()
  })

  it('always yields a valid label', () => {
    for (const name of [
      'web/eink',
      '-x-',
      'ÄÖÜ',
      'a'.repeat(200),
      '9/9',
      'multi-stack/framelink/app',
    ]) {
      expect(slugProblem(slugify(name))).toBeNull()
    }
  })
})
