import { describe, expect, it } from 'vitest'
import type { DiscoveredTemplate } from '$lib/templates'
import { buildRail, referencesByFile } from './rail'

const template = (family: string, name: string): DiscoveredTemplate => ({
  family,
  name,
  description: '',
  version: '1.0.0',
  path: `/t/${family}/${name}`,
  variables: [],
})

describe('buildRail', () => {
  it('sorts templates and broken folders by family, then name', () => {
    const items = buildRail(
      [template('web', 'svelte'), template('python', 'fastapi')],
      [{ family: 'web', name: 'astro', path: '/t/web/astro', message: 'bad json' }],
      [],
    )
    expect(items.map((i) => `${i.id}:${i.status}`)).toEqual([
      'python/fastapi:clean',
      'web/astro:error',
      'web/svelte:clean',
    ])
  })

  it('marks a template with a warn or error finding, not with an info one', () => {
    const items = buildRail(
      [template('web', 'a'), template('web', 'b')],
      [],
      [
        { level: 'info', code: 'x', template: 'web/a', message: '' },
        { level: 'warn', code: 'y', template: 'web/b', message: '' },
      ],
    )
    expect(items.map((i) => i.status)).toEqual(['clean', 'warn'])
  })
})

describe('referencesByFile', () => {
  it('groups by file and keeps each kind once', () => {
    const map = referencesByFile([
      { file: 'a.md', kind: 'interpolation' },
      { file: 'a.md', kind: 'interpolation' },
      { file: 'a.md', kind: 'hook' },
      { file: 'b.md', kind: 'conditional' },
    ])
    expect([...map]).toEqual([
      ['a.md', ['interpolation', 'hook']],
      ['b.md', ['conditional']],
    ])
  })
})
