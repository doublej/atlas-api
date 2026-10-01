<script lang="ts">
import { onMount } from 'svelte'
import { invalidateAll } from '$app/navigation'
import { page } from '$app/state'
import * as api from '$lib/browser/api'
import {
  countActiveFilters,
  type FilterCriteria,
  matchesFilters,
  type PromotionFilter,
  toggleSet,
} from '$lib/browser/filters'
import { buildFolderTree, collectFolderPaths } from '$lib/browser/tree'
import BrowserHeader from '$lib/components/browser/BrowserHeader.svelte'
import FilterPanel from '$lib/components/browser/FilterPanel.svelte'
import HostBanner from '$lib/components/browser/HostBanner.svelte'
import ProjectViews from '$lib/components/browser/ProjectViews.svelte'
import Toolbar from '$lib/components/browser/Toolbar.svelte'
import BeadsDialog from '$lib/components/dialogs/BeadsDialog.svelte'
import MoveDialog from '$lib/components/dialogs/MoveDialog.svelte'
import ProjectSettings from '$lib/components/dialogs/ProjectSettings.svelte'
import RenameDialog from '$lib/components/dialogs/RenameDialog.svelte'
import ProjectRow from '$lib/components/project/ProjectRow.svelte'
import { errorMessage } from '$lib/format'
import { ProjectRecords } from '$lib/project-records.svelte'
import type { ProjectSummary } from '$lib/project-summary'
import type { Framework, GitStatus, Project } from '$lib/scanner'
import { toast } from '$lib/toast.svelte'
import type { ActionDef } from '$shared/actions'

type ViewMode = 'table' | 'flat' | 'nested'

let { data } = $props()
// Writable deriveds, not $state + $effect: the rows render during SSR and hydration instead
// of an empty page re-rendered after mount, and ~560 records skip the deep proxy.
let projects = $derived<ProjectSummary[]>(data.projects)
let frameworks = $derived<Framework[]>(data.frameworks)
let folders = $derived<string[]>(data.folders)
let isRefreshing = $state(false)

let search = $state(page.url.searchParams.get('q') ?? '')
let selectedFrameworks = $state<Set<Framework>>(new Set())
let selectedTypes = $state<Set<string>>(new Set())
let selectedRunners = $state<Set<string>>(new Set())
let selectedHosts = $state<Set<string>>(new Set())
let selectedTools = $state<Set<string>>(new Set())
let onlyWithDev = $state(false)
let onlyWithReadme = $state(false)
let selectedPromotion = $state<PromotionFilter | null>(null)
let runningPorts = $state<Record<string, string>>({})
let showFilters = $state(false)
let renaming = $state<Project | null>(null)
let moving = $state<Project | null>(null)
let settingsFor = $state<Project | null>(null)
let beadsFor = $state<Project | null>(null)
let viewMode = $state<ViewMode>('table')
let expandedFolders = $state<Set<string>>(new Set())
type GitState = { status: GitStatus; branch?: string }
let probedGit = $state<Record<string, GitState>>({})
// The page data's git state (the cache's) makes the server-rendered dots real; a probe fills in
// the rest. Not `projects`: a settings save swaps in a rescan made without git, which blanked them.
const gitStatus = $derived<Record<string, GitState>>({
  ...probedGit,
  ...Object.fromEntries(
    data.projects.flatMap((p) => (p.git ? [[p.path, { status: p.git, branch: p.gitBranch }]] : [])),
  ),
})
let hostnames = $state<Record<string, { local: string; remote: string }>>({})

const criteria = $derived<FilterCriteria>({
  search,
  frameworks: selectedFrameworks,
  types: selectedTypes,
  runners: selectedRunners,
  hosts: selectedHosts,
  tools: selectedTools,
  onlyWithDev,
  onlyWithReadme,
  promotion: selectedPromotion,
})

const types = $derived([...new Set(projects.map((p) => p.type).filter(Boolean))] as string[])
const runners = $derived([...new Set(projects.map((p) => p.runner).filter(Boolean))] as string[])
const hosts = $derived([...new Set(projects.map((p) => p.host).filter(Boolean))])
const filtered = $derived(projects.filter((p) => matchesFilters(p, criteria)))
const activeFilterCount = $derived(countActiveFilters(criteria))
const nestedProjects = $derived(buildFolderTree(filtered))
const hasJust = $derived(projects.some((p) => p.hasJustfile))
const hasPromotion = $derived(projects.some((p) => p.promotion))
const showHost = $derived(hosts.length > 1)
const degraded = $derived((data.hosts ?? []).filter((h) => h.status !== 'ok'))

const records = new ProjectRecords()

/** After a settings save: rescan now (a cached read would miss the change) and keep its records. */
async function refreshNow(): Promise<void> {
  if (isRefreshing) return
  isRefreshing = true
  const result = await api.refreshProjects().catch(fail)
  if (result) {
    records.keep(result.projects)
    projects = result.projects
    frameworks = result.frameworks
    folders = result.folders
  }
  isRefreshing = false
}

// A stale cache is already being rescanned on the server (one scan at a time); reload once it
// should have landed. Forcing a second scan from here is what made every stale view take 1-30s.
$effect(() => {
  if (!data.stale) return
  const timer = setTimeout(() => invalidateAll(), 15_000)
  return () => clearTimeout(timer)
})

onMount(() => {
  // The cache already carries git state for every local project (refreshed every 60s), so
  // only a project it has none for yet is probed — probing all ~500 on each load spawned
  // ~500 git processes and held every browser connection for ~40s.
  api
    .loadGitStatuses(
      projects.filter((p) => p.isLocal && !p.git).map((p) => p.path),
      (results) => {
        const probed = results.map((r) => [r.path, { status: r.status, branch: r.branch }])
        probedGit = { ...probedGit, ...Object.fromEntries(probed) }
      },
    )
    .catch(fail)
  // Best-effort — an unprovisioned Caddy setup just means no project shows a hostname.
  api
    .fetchHostnames()
    .then((rows) => {
      for (const h of rows) hostnames[h.slug] = { local: h.local, remote: h.remote }
    })
    .catch(() => {})
})

function toggleFolder(path: string): void {
  expandedFolders = toggleSet(expandedFolders, path)
}

function expandAllFolders(): void {
  expandedFolders = collectFolderPaths(nestedProjects)
}

function collapseAllFolders(): void {
  expandedFolders = new Set()
}

function clearFilters(): void {
  selectedFrameworks = new Set()
  selectedTypes = new Set()
  selectedRunners = new Set()
  selectedHosts = new Set()
  selectedTools = new Set()
  onlyWithDev = false
  onlyWithReadme = false
  selectedPromotion = null
}

async function runDev(project: ProjectSummary): Promise<void> {
  const url = await api.runDevServer(project).catch(fail)
  if (!url) return
  runningPorts[project.path] = url
  setTimeout(() => window.open(url, '_blank'), 2000)
}

async function runScript(project: Project, script: string): Promise<void> {
  const url = await api.runScript(project, script).catch(fail)
  if (url) runningPorts[project.path] = url
}

async function runJust(project: Project, recipe: string): Promise<void> {
  const url = await api.runJustRecipe(project, recipe).catch(fail)
  if (url) runningPorts[project.path] = url
}

/** A failed API call ends here, as an error toast carrying the server's own text. */
function fail(e: unknown): null {
  toast(errorMessage(e), 'error')
  return null
}

async function onAction(action: ActionDef, project: Project): Promise<void> {
  if (action.id === 'project-settings') {
    settingsFor = project
  } else if (action.id === 'beads-create') {
    beadsFor = project
  } else {
    const { ok, note } = await api.runAction(action, project)
    toast(note, ok ? 'info' : 'error')
  }
}

async function doRename(newName: string): Promise<void> {
  if (!renaming) return
  try {
    await api.renameProject(renaming.path, newName)
    location.reload()
  } catch (e) {
    fail(e)
  }
}

async function doMove(targetFolder: string): Promise<void> {
  if (!moving) return
  try {
    await api.moveProject(moving.path, `${data.baseDir}/${targetFolder}`)
    location.reload()
  } catch (e) {
    fail(e)
  }
}
</script>

<svelte:head>
	<title>Atlas - Projects</title>
</svelte:head>

{#snippet projectItem(project: Project)}
	<ProjectRow
		{project}
		git={gitStatus[project.path]}
		runningUrl={runningPorts[project.path]}
		hostname={hostnames[project.slug]}
		onRunDev={runDev}
		onRunScript={runScript}
		onRunJust={runJust}
		onIterm={(path) => api.openInITerm(path).catch(fail)}
		onFinder={(path) => api.openInFinder(path).catch(fail)}
		onRename={(project) => (renaming = project)}
		onMove={(project) => (moving = project)}
		{onAction}
		{showHost}
		templateVersions={data.templateVersions}
	/>
{/snippet}

<main class:wide={viewMode === 'table'}>
	<div class="topbar">
		<BrowserHeader
			filteredCount={filtered.length}
			totalCount={projects.length}
			refreshing={isRefreshing}
		/>
		<Toolbar
			bind:search
			bind:viewMode
			bind:showFilters
			{activeFilterCount}
			onExpandAll={expandAllFolders}
			onCollapseAll={collapseAllFolders}
			onClearFilters={clearFilters}
		/>
	</div>

	<HostBanner hosts={degraded} />

	{#if showFilters}
		<div class="filter-region">
			<FilterPanel
				{types}
				{frameworks}
				{runners}
				{hosts}
				showTools={hasJust}
				showPromotion={hasPromotion}
				bind:selectedTypes
				bind:selectedFrameworks
				bind:selectedRunners
				bind:selectedHosts
				bind:selectedTools
				bind:onlyWithDev
				bind:onlyWithReadme
				bind:promotion={selectedPromotion}
			/>
		</div>
	{/if}

	<ProjectViews
		projects={filtered}
		total={projects.length}
		{viewMode}
		{records}
		error={data.error}
		onretry={() => invalidateAll()}
		onClearFilters={clearFilters}
		tree={nestedProjects}
		{expandedFolders}
		onToggleFolder={toggleFolder}
		{gitStatus}
		{hostnames}
		{runningPorts}
		{showHost}
		onRunDev={runDev}
		item={projectItem}
	/>
</main>

<ProjectSettings
	project={settingsFor}
	onclose={() => (settingsFor = null)}
	onsaved={refreshNow}
/>

<BeadsDialog project={beadsFor} onclose={() => (beadsFor = null)} />

<RenameDialog project={renaming} onCancel={() => (renaming = null)} onConfirm={doRename} />

<MoveDialog project={moving} {folders} onCancel={() => (moving = null)} onConfirm={doMove} />

<style>
	main {
		width: 100%;
		max-width: var(--col-max);
		min-height: 100vh;
		margin: 0 auto;
		padding: 0 var(--page-pad) var(--space-16);
	}

	/* 500+ projects: the table takes the whole window, not the reading column. */
	main.wide {
		max-width: none;
	}

	/* Header and toolbar travel together as one sticky band, stacked below the
	   global nav (also sticky top:0 — offset here so the two bands don't
	   overlap once scrolled). */
	.topbar {
		position: sticky;
		top: var(--nav-h);
		z-index: 50;
		background: var(--color-bg);
		padding-bottom: var(--space-2);
		margin-bottom: var(--section-gap);
	}

	.topbar::after {
		content: '';
		position: absolute;
		inset: auto 0 0;
		height: var(--hairline);
		background: var(--grad-divider);
	}

	.filter-region {
		margin-bottom: var(--section-gap);
	}



	@media (max-width: 768px) {
		main {
			padding: 0 var(--space-4) var(--space-12);
		}

		/* A phone can't spare a quarter of its height to the band: only the nav stays put. */
		.topbar {
			position: relative;
			top: 0;
		}
	}
</style>
