// Folder-tree construction for the nested view. Pure, so it can be unit-tested
// without a component; the page owns which folders are expanded.

import type { Project } from '$lib/scanner'

export interface FolderNode {
  name: string
  path: string
  projects: Project[]
  children: Map<string, FolderNode>
}

function emptyNode(name: string, path: string): FolderNode {
  return { name, path, projects: [], children: new Map() }
}

/**
 * Group projects into a folder hierarchy keyed by their relative path. A project
 * whose relativePath has no directory part lands on the root node.
 */
export function buildFolderTree(projects: Project[]): FolderNode {
  const root = emptyNode('', '')

  for (const project of projects) {
    const parts = project.relativePath.split('/')
    parts.pop() // the last segment is the project itself, not a folder
    let current = root

    for (const [index, part] of parts.entries()) {
      const folderPath = parts.slice(0, index + 1).join('/')
      let child = current.children.get(part)
      if (!child) {
        child = emptyNode(part, folderPath)
        current.children.set(part, child)
      }
      current = child
    }
    current.projects.push(project)
  }

  return root
}

/** Every folder path in the tree — used by "expand all". */
export function collectFolderPaths(node: FolderNode): Set<string> {
  const paths = new Set<string>()
  const walk = (current: FolderNode): void => {
    for (const child of current.children.values()) {
      paths.add(child.path)
      walk(child)
    }
  }
  walk(node)
  return paths
}

/** Projects in this folder and every folder beneath it. */
export function countProjects(node: FolderNode): number {
  let count = node.projects.length
  for (const child of node.children.values()) {
    count += countProjects(child)
  }
  return count
}
