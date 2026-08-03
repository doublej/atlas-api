import { describe, expect, it } from 'vitest'
import type { Project } from '$lib/scanner'
import { buildFolderTree, collectFolderPaths, countProjects } from './tree'

const project = (relativePath: string): Project =>
  ({ name: relativePath.split('/').pop(), path: `/dev/${relativePath}`, relativePath }) as Project

describe('buildFolderTree', () => {
  it('puts a top-level project on the root node', () => {
    const tree = buildFolderTree([project('atlas-api')])
    expect(tree.projects.map((p) => p.relativePath)).toEqual(['atlas-api'])
    expect(tree.children.size).toBe(0)
  })

  it('nests by every path segment except the project itself', () => {
    const tree = buildFolderTree([project('multi-stack/project-atlas/atlas-api')])
    const multiStack = tree.children.get('multi-stack')
    expect(multiStack?.path).toBe('multi-stack')
    const projectAtlas = multiStack?.children.get('project-atlas')
    expect(projectAtlas?.path).toBe('multi-stack/project-atlas')
    expect(projectAtlas?.projects).toHaveLength(1)
  })

  it('shares folder nodes between siblings', () => {
    const tree = buildFolderTree([project('web/alpha'), project('web/beta')])
    expect(tree.children.size).toBe(1)
    expect(tree.children.get('web')?.projects).toHaveLength(2)
  })
})

describe('collectFolderPaths', () => {
  it('returns every folder path and excludes the root', () => {
    const tree = buildFolderTree([project('multi-stack/project-atlas/atlas-api'), project('web/a')])
    expect([...collectFolderPaths(tree)].sort()).toEqual([
      'multi-stack',
      'multi-stack/project-atlas',
      'web',
    ])
  })
})

describe('countProjects', () => {
  it('counts this folder and everything below it', () => {
    const tree = buildFolderTree([project('web/a'), project('web/nested/b'), project('top-level')])
    expect(countProjects(tree)).toBe(3)
    expect(countProjects(tree.children.get('web')!)).toBe(2)
  })
})
