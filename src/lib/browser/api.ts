// Typed wrappers over the endpoints the project browser calls. One place that
// knows the request shapes, so components stay markup.

import type { Framework, GitStatus, Project } from '$lib/scanner'

async function postJson<T>(endpoint: string, body: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as T
}

export interface ScanPayload {
  projects: Project[]
  frameworks: Framework[]
  folders: string[]
}

export interface GitResult {
  path: string
  status: GitStatus
  branch?: string
}

const GIT_BATCH_SIZE = 20

export async function refreshProjects(): Promise<ScanPayload> {
  const res = await fetch('/api/refresh', { method: 'POST' })
  return (await res.json()) as ScanPayload
}

export async function fetchReadme(path: string): Promise<string | null> {
  const { readme } = await postJson<{ readme?: string }>('/api/readme', { path })
  return readme ?? null
}

/**
 * Load git status in batches so the first rows light up early. `onBatch` is
 * called once per completed batch; batches are issued concurrently.
 */
export function loadGitStatuses(
  paths: string[],
  onBatch: (results: GitResult[]) => void,
): Promise<void[]> {
  const batches: Promise<void>[] = []
  for (let i = 0; i < paths.length; i += GIT_BATCH_SIZE) {
    const slice = paths.slice(i, i + GIT_BATCH_SIZE)
    batches.push(
      postJson<GitResult[]>('/api/git', { paths: slice }).then((results) => onBatch(results)),
    )
  }
  return Promise.all(batches)
}

export async function runDevServer(project: Project): Promise<string | null> {
  if (!project.devCommand) return null
  const result = await postJson<{ url?: string }>('/api/run', {
    path: project.path,
    command: project.devCommand,
    runner: project.runner || 'npm',
  })
  return result.url ?? null
}

export async function runScript(project: Project, script: string): Promise<string | null> {
  const result = await postJson<{ url?: string }>('/api/run', {
    path: project.path,
    command: script,
    runner: project.runner || 'npm',
  })
  return result.url ?? null
}

export async function runJustRecipe(project: Project, recipe: string): Promise<string | null> {
  const result = await postJson<{ url?: string }>('/api/run', {
    path: project.path,
    command: recipe,
    type: 'just',
  })
  return result.url ?? null
}

export async function openInITerm(path: string): Promise<void> {
  await postJson('/api/iterm', { path })
}

export async function openInFinder(path: string): Promise<void> {
  await postJson('/api/finder', { path })
}

export async function saveDescription(path: string, description: string): Promise<void> {
  await postJson('/api/description', { path, description }, 'PUT')
}

export async function renameProject(path: string, newName: string): Promise<void> {
  await postJson('/api/rename', { path, newName })
}

export async function moveProject(sourcePath: string, targetDir: string): Promise<void> {
  await postJson('/api/move', { sourcePath, targetDir })
}
