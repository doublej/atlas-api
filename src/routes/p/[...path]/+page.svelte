<script lang="ts">
import { onMount } from 'svelte'
import { goto, invalidateAll } from '$app/navigation'
import * as api from '$lib/browser/api'
import BeadsDialog from '$lib/components/dialogs/BeadsDialog.svelte'
import MoveDialog from '$lib/components/dialogs/MoveDialog.svelte'
import RenameDialog from '$lib/components/dialogs/RenameDialog.svelte'
import ClaudeSection from '$lib/components/projectpage/ClaudeSection.svelte'
import { projectHref } from '$lib/components/projectpage/href'
import OverviewSection from '$lib/components/projectpage/OverviewSection.svelte'
import ProjectHeader from '$lib/components/projectpage/ProjectHeader.svelte'
import SectionIndex from '$lib/components/projectpage/parts/SectionIndex.svelte'
import { ProjectProcesses } from '$lib/components/projectpage/processes.svelte'
import RunSection from '$lib/components/projectpage/RunSection.svelte'
import SettingsSection from '$lib/components/projectpage/SettingsSection.svelte'
import WorkSection from '$lib/components/projectpage/WorkSection.svelte'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import type { Project } from '$lib/scanner'
import { toast } from '$lib/toast.svelte'
import type { ActionDef } from '$shared/actions'

const { data } = $props()

// Writable deriveds: an edit shows at once, the next load replaces it.
let project = $derived<Project>(data.project)
let tags = $derived<string[]>(data.project.tags ?? [])
let vocabulary = $state<string[]>([])
let runningUrl = $state<string | undefined>()
let renaming = $state<Project | null>(null)
let moving = $state<Project | null>(null)
let beadsFor = $state<Project | null>(null)

const processes = $derived(new ProjectProcesses(data.project.path))
$effect(() => {
  if (project.isLocal) return processes.poll()
})

onMount(() => {
  http
    .get<{ tags: { tag: string }[] }>('/api/tags')
    .then((v) => (vocabulary = v.tags.map((t) => t.tag)))
    .catch(() => {}) // completions are a nicety; the input works without them
})

/** A failed API call ends here, as an error toast carrying the server's own text. */
function fail(e: unknown): null {
  toast(errorMessage(e), 'error')
  return null
}

/** Rescan now (the cached catalog would miss the change), then go to `href` or reload. */
async function rescan(href?: string): Promise<void> {
  await api.refreshProjects().catch(fail)
  if (href) await goto(href, { replaceState: true })
  else await invalidateAll()
}

async function rename(name: string): Promise<void> {
  await api.renameProject(project.path, name)
  const parent = project.relativePath.split('/').slice(0, -1)
  toast(`Renamed to ${name}`)
  await rescan(projectHref([...parent, name].join('/')))
}

async function move(folder: string): Promise<void> {
  const target = project
  moving = null
  try {
    await api.moveProject(target.path, `${data.baseDir}/${folder}`)
  } catch (e) {
    fail(e)
    return
  }
  toast(`Moved to ${folder}`)
  await rescan(projectHref(`${folder}/${target.name}`))
}

async function saveDescription(text: string): Promise<void> {
  await api.saveDescription(project.path, text)
  project = { ...project, description: text }
}

async function saveTags(next: string[]): Promise<void> {
  const before = tags
  tags = next
  try {
    tags = (await http.put<{ tags: string[] }>('/api/tags', { path: project.path, tags: next }))
      .tags
  } catch (e) {
    tags = before
    fail(e)
  }
}

async function archive(archived: boolean): Promise<void> {
  await http.post('/api/archive', { path: project.path, archived })
  toast(archived ? 'Archived' : 'Unarchived')
  await rescan()
}

async function runDev(p: Project): Promise<void> {
  const url = await api.runDevServer(p).catch(fail)
  if (!url) return
  runningUrl = url
  processes.load(true)
  setTimeout(() => window.open(url, '_blank'), 2000)
}

async function runScript(p: Project, script: string): Promise<void> {
  runningUrl = (await api.runScript(p, script).catch(fail)) ?? runningUrl
  processes.load(true)
}

async function runJust(p: Project, recipe: string): Promise<void> {
  runningUrl = (await api.runJustRecipe(p, recipe).catch(fail)) ?? runningUrl
  processes.load(true)
}

async function stopDev(): Promise<void> {
  try {
    const { stopped } = await http.delete<{ stopped: boolean }>('/api/run', { path: project.path })
    toast(stopped ? 'Dev server stopped' : 'Nothing was listening on the project port')
    runningUrl = undefined
  } catch (e) {
    fail(e)
  }
  processes.load(true)
}

async function onAction(action: ActionDef, p: Project): Promise<void> {
  if (action.id === 'project-settings') document.getElementById('settings')?.scrollIntoView()
  else if (action.id === 'beads-create') beadsFor = p
  else {
    const { ok, note } = await api.runAction(action, p)
    toast(note, ok ? 'info' : 'error')
  }
}

const actions = {
  onRunDev: runDev,
  onRunScript: runScript,
  onRunJust: runJust,
  onIterm: (path: string) => api.openInITerm(path).catch(fail),
  onFinder: (path: string) => api.openInFinder(path).catch(fail),
  onRename: (p: Project) => (renaming = p),
  onMove: (p: Project) => (moving = p),
  onAction,
}

/** `[` and `]` step through the catalog; never while typing or with a dialog open. */
function onkeydown(e: KeyboardEvent): void {
  if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return
  if ((e.target as Element).closest?.('input, textarea, select, [contenteditable]')) return
  const to = e.key === '[' ? data.prev : e.key === ']' ? data.next : undefined
  if (to) goto(to.href)
}
</script>

<svelte:head>
  <title>{project.name} · Atlas</title>
</svelte:head>

<svelte:window {onkeydown} />

<main>
  <ProjectHeader
    {project}
    git={data.git}
    twins={data.twins}
    prev={data.prev}
    next={data.next}
    {tags}
    {vocabulary}
    running={processes.running}
    onrename={rename}
    ondescription={saveDescription}
    ontags={saveTags}
    onstop={stopDev}
    {actions}
  />

  <div class="body">
    <SectionIndex />

    <div class="sections">
      {#key project.path}
        <OverviewSection {project} git={data.git} templateVersions={data.templateVersions} />
        <RunSection
          {project}
          {processes}
          {runningUrl}
          onRunDev={runDev}
          onRunScript={runScript}
          onRunJust={runJust}
          onstop={stopDev}
        />
        <WorkSection {project} onticket={() => (beadsFor = project)} />
        <ClaudeSection {project} />
        <SettingsSection
          {project}
          {tags}
          {vocabulary}
          ontags={saveTags}
          onsaved={() => rescan()}
          onrename={() => (renaming = project)}
          onmove={() => (moving = project)}
          onarchive={archive}
        />
      {/key}
    </div>
  </div>
</main>

<BeadsDialog project={beadsFor} onclose={() => (beadsFor = null)} />

<RenameDialog
  project={renaming}
  onCancel={() => (renaming = null)}
  onConfirm={(name) => {
    renaming = null
    rename(name).catch(fail)
  }}
/>

<MoveDialog project={moving} folders={data.folders} onCancel={() => (moving = null)} onConfirm={move} />

<style>
  main {
    width: 100%;
    max-width: 1180px;
    margin: 0 auto;
    padding: 0 var(--page-pad) var(--space-16);
  }

  .body {
    display: grid;
    grid-template-columns: 140px minmax(0, 1fr);
    gap: var(--space-6);
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--section-gap);
    min-width: 0;
  }

  @media (max-width: 768px) {
    main {
      padding: 0 var(--space-4) var(--space-12);
    }

    .body {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-3);
    }
  }
</style>
