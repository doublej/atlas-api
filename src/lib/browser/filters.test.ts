import { describe, expect, it } from 'vitest'
import type { Project } from '$lib/scanner'
import { countActiveFilters, emptyCriteria, matchesFilters, toggleSet } from './filters'

function project(overrides: Partial<Project> = {}): Project {
  return {
    name: 'atlas-api',
    path: '/dev/multi-stack/atlas-api',
    relativePath: 'multi-stack/atlas-api',
    ...overrides,
  } as Project
}

describe('matchesFilters', () => {
  it('keeps everything when no filter is set', () => {
    expect(matchesFilters(project(), emptyCriteria())).toBe(true)
  })

  it('searches name, relative path and description case-insensitively', () => {
    const p = project({ description: 'Scans the dev folder' })
    for (const search of ['ATLAS', 'multi-stack', 'scans the dev']) {
      expect(matchesFilters(p, { ...emptyCriteria(), search })).toBe(true)
    }
    expect(matchesFilters(p, { ...emptyCriteria(), search: 'nonexistent' })).toBe(false)
  })

  it('does not crash searching a project without a description', () => {
    expect(matchesFilters(project(), { ...emptyCriteria(), search: 'zzz' })).toBe(false)
  })

  it('filters by type, runner and framework', () => {
    const p = project({ type: 'node', runner: 'bun', framework: 'sveltekit' })
    expect(matchesFilters(p, { ...emptyCriteria(), types: new Set(['node']) })).toBe(true)
    expect(matchesFilters(p, { ...emptyCriteria(), types: new Set(['python']) })).toBe(false)
    expect(matchesFilters(p, { ...emptyCriteria(), runners: new Set(['npm']) })).toBe(false)
    expect(matchesFilters(p, { ...emptyCriteria(), frameworks: new Set(['sveltekit']) })).toBe(true)
  })

  it('excludes projects missing the faceted field entirely', () => {
    expect(matchesFilters(project(), { ...emptyCriteria(), types: new Set(['node']) })).toBe(false)
  })

  it('filters by justfile, dev command and readme', () => {
    const bare = project()
    expect(matchesFilters(bare, { ...emptyCriteria(), tools: new Set(['just']) })).toBe(false)
    expect(matchesFilters(bare, { ...emptyCriteria(), onlyWithDev: true })).toBe(false)
    expect(matchesFilters(bare, { ...emptyCriteria(), onlyWithReadme: true })).toBe(false)

    const full = project({ hasJustfile: true, devCommand: 'dev', readme: 'README.md' })
    expect(matchesFilters(full, { ...emptyCriteria(), tools: new Set(['just']) })).toBe(true)
    expect(matchesFilters(full, { ...emptyCriteria(), onlyWithDev: true })).toBe(true)
    expect(matchesFilters(full, { ...emptyCriteria(), onlyWithReadme: true })).toBe(true)
  })

  it('splits promoted, unpromoted and in-progress', () => {
    const promoted = project({ promotion: { status: 'published' } as Project['promotion'] })
    const inProgress = project({ promotion: { status: 'in-progress' } as Project['promotion'] })
    const plain = project()

    expect(matchesFilters(promoted, { ...emptyCriteria(), promotion: 'promoted' })).toBe(true)
    expect(matchesFilters(plain, { ...emptyCriteria(), promotion: 'promoted' })).toBe(false)
    expect(matchesFilters(plain, { ...emptyCriteria(), promotion: 'unpromoted' })).toBe(true)
    expect(matchesFilters(inProgress, { ...emptyCriteria(), promotion: 'in-progress' })).toBe(true)
    expect(matchesFilters(promoted, { ...emptyCriteria(), promotion: 'in-progress' })).toBe(false)
  })

  it('requires every active filter to pass', () => {
    const p = project({ type: 'node', devCommand: 'dev' })
    const criteria = { ...emptyCriteria(), types: new Set(['node']), onlyWithReadme: true }
    expect(matchesFilters(p, criteria)).toBe(false)
  })
})

describe('countActiveFilters', () => {
  it('ignores search but counts every facet', () => {
    expect(countActiveFilters({ ...emptyCriteria(), search: 'anything' })).toBe(0)
    expect(
      countActiveFilters({
        ...emptyCriteria(),
        types: new Set(['node', 'rust']),
        onlyWithDev: true,
        promotion: 'promoted',
      }),
    ).toBe(4)
  })
})

describe('toggleSet', () => {
  it('adds, removes, and never mutates the input', () => {
    const original = new Set(['a'])
    const added = toggleSet(original, 'b')
    expect([...added]).toEqual(['a', 'b'])
    expect([...original]).toEqual(['a'])
    expect([...toggleSet(added, 'a')]).toEqual(['b'])
  })
})
