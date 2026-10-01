// Typed wrappers over the endpoints the project browser calls. One place that
// knows the request shapes, so components stay markup.

import type { Framework, GitStatus, Project } from '$lib/scanner'
import type { ActionDef } from '$shared/actions'

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
): Promise<unknown> {
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
  const result = await postJson<{ url?: string; local?: string }>('/api/run', {
    path: project.path,
    command: project.devCommand,
    runner: project.runner || 'npm',
  })
  return result.local ?? result.url ?? null
}

export async function runScript(project: Project, script: string): Promise<string | null> {
  const result = await postJson<{ url?: string; local?: string }>('/api/run', {
    path: project.path,
    command: script,
    runner: project.runner || 'npm',
  })
  return result.local ?? result.url ?? null
}

export async function runJustRecipe(project: Project, recipe: string): Promise<string | null> {
  const result = await postJson<{ url?: string; local?: string }>('/api/run', {
    path: project.path,
    command: recipe,
    type: 'just',
  })
  return result.local ?? result.url ?? null
}

export interface Hostname {
  slug: string
  path: string
  local: string
  remote: string
}

export async function fetchHostnames(): Promise<Hostname[]> {
  const res = await fetch('/api/hostnames')
  return (await res.json()) as Hostname[]
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

// --- Registry actions --------------------------------------------------------
export interface ActionResult {
  ok: boolean
  /** What to tell the user — a copied value, a created file, or the server's error text. */
  note: string
}

/** Actions the page owns because they open a dialog rather than fire and forget. */
export const DIALOG_ACTIONS = new Set([
  'rename',
  'move',
  'beads-create',
  'project-settings',
  'edit-description',
])

/** No browser equivalent: "Open With" is a macOS Finder affordance, not a web one. */
const UNSUPPORTED = new Set(['open-default'])

export const isRunnable = (action: ActionDef): boolean =>
  !UNSUPPORTED.has(action.id) && !DIALOG_ACTIONS.has(action.id)

const fill = (value: string, project: Project): string =>
  value
    .replaceAll('{{project.path}}', project.path)
    .replaceAll('{{devCommand}}', project.devCommand ?? '')

async function getJson<T>(url: string): Promise<T> {
  return (await fetch(url).then((r) => r.json())) as T
}

/** The text a copy action puts on the clipboard — templated, or fetched when it is a file. */
async function copyText(action: ActionDef, project: Project): Promise<string> {
  if (action.value) return fill(action.value, project)

  if (action.id === 'copy-claude-rules') {
    const { content } = await getJson<{ content: string | null }>(
      `/api/agent-files?path=${encodeURIComponent(project.path)}&file=claude`,
    )
    if (!content) throw new Error('no CLAUDE.md in this project')
    return content
  }

  if (action.id === 'copy-env') {
    const { files } = await getJson<{ files: { name: string; content: string | null }[] }>(
      `/api/env-files?path=${encodeURIComponent(project.path)}`,
    )
    const text = files
      .filter((f) => f.content)
      .map((f) => `# ${f.name}\n${f.content}`)
      .join('\n')
    if (!text) throw new Error('no .env files in this project')
    return text
  }

  return project.path
}

const RUNNERS: Record<string, (action: ActionDef, project: Project) => Promise<ActionResult>> = {
  clipboard: runClipboard,
  'iterm-command': runIterm,
  'open-url': runOpenUrl,
  api: runApiAction,
}

/** Every failure lands here as a note, so a dead endpoint reads as a message, not a blank menu. */
export async function runAction(action: ActionDef, project: Project): Promise<ActionResult> {
  const runner = RUNNERS[action.type]
  if (!runner) {
    return { ok: false, note: `${action.type} actions are not wired up in the browser yet` }
  }
  try {
    return await runner(action, project)
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message : String(err) }
  }
}

async function runClipboard(action: ActionDef, project: Project): Promise<ActionResult> {
  const text = await copyText(action, project)
  await navigator.clipboard.writeText(text)
  return { ok: true, note: `Copied — ${text.split('\n')[0].slice(0, 60)}` }
}

async function runIterm(action: ActionDef, project: Project): Promise<ActionResult> {
  const { error } = await postJson<{ error?: string }>('/api/iterm', {
    path: project.path,
    command: action.command,
  })
  return error ? { ok: false, note: error } : { ok: true, note: `iTerm — ${action.command}` }
}

async function runOpenUrl(action: ActionDef, project: Project): Promise<ActionResult> {
  // The registry's own value is a template; the tree viewer is served by atlas itself.
  const url = action.value
    ? action.value.replaceAll('{{project.path}}', encodeURIComponent(project.path))
    : ''
  if (!url) return { ok: false, note: 'no URL for this action' }
  window.open(url, '_blank')
  return { ok: true, note: `Opened ${url}` }
}

async function runApiAction(action: ActionDef, project: Project): Promise<ActionResult> {
  const body: Record<string, unknown> = { path: project.path }

  if (action.id.startsWith('agent-create-')) body.file = action.id.slice('agent-create-'.length)
  if (action.id === 'agent-copy-claude-to-agents')
    Object.assign(body, { from: 'claude', to: 'agents' })
  if (action.id === 'agent-copy-agents-to-claude')
    Object.assign(body, { from: 'agents', to: 'claude' })

  const { error } = await postJson<{ error?: string }>(
    action.api?.endpoint ?? '',
    body,
    action.api?.method ?? 'POST',
  )
  return error ? { ok: false, note: error } : { ok: true, note: `${action.label} — done` }
}
