<script lang="ts">
import { onMount } from 'svelte'
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
import FolderTree from '$lib/components/browser/FolderTree.svelte'
import MoveDialog from '$lib/components/browser/MoveDialog.svelte'
import RenameDialog from '$lib/components/browser/RenameDialog.svelte'
import Toolbar from '$lib/components/browser/Toolbar.svelte'
import ProjectRow from '$lib/components/project/ProjectRow.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { Framework, GitStatus, Project } from '$lib/scanner'

type ViewMode = 'flat' | 'nested'

let { data } = $props()
let projects = $state<Project[]>([])
let frameworks = $state<Framework[]>([])
let folders = $state<string[]>([])
let isRefreshing = $state(false)

$effect(() => {
  projects = data.projects
  frameworks = data.frameworks
  folders = data.folders
})

let search = $state('')
let selectedFrameworks = $state<Set<Framework>>(new Set())
let selectedTypes = $state<Set<string>>(new Set())
let selectedRunners = $state<Set<string>>(new Set())
let selectedTools = $state<Set<string>>(new Set())
let onlyWithDev = $state(false)
let onlyWithReadme = $state(false)
let selectedPromotion = $state<PromotionFilter | null>(null)
let runningPorts = $state<Record<string, string>>({})
let showFilters = $state(true)
let renaming = $state<Project | null>(null)
let moving = $state<Project | null>(null)
let viewMode = $state<ViewMode>('flat')
let expandedFolders = $state<Set<string>>(new Set())
let gitStatus = $state<Record<string, { status: GitStatus; branch?: string }>>({})

const criteria = $derived<FilterCriteria>({
  search,
  frameworks: selectedFrameworks,
  types: selectedTypes,
  runners: selectedRunners,
  tools: selectedTools,
  onlyWithDev,
  onlyWithReadme,
  promotion: selectedPromotion,
})

const types = $derived([...new Set(projects.map((p) => p.type).filter(Boolean))] as string[])
const runners = $derived([...new Set(projects.map((p) => p.runner).filter(Boolean))] as string[])
const filtered = $derived(projects.filter((p) => matchesFilters(p, criteria)))
const activeFilterCount = $derived(countActiveFilters(criteria))
const nestedProjects = $derived(buildFolderTree(filtered))
const hasJust = $derived(projects.some((p) => p.hasJustfile))

async function refreshInBackground(): Promise<void> {
  if (isRefreshing) return
  isRefreshing = true
  const result = await api.refreshProjects()
  projects = result.projects
  frameworks = result.frameworks
  folders = result.folders
  isRefreshing = false
}

onMount(() => {
  if (data.stale) refreshInBackground()
  api.loadGitStatuses(
    projects.map((p) => p.path),
    (results) => {
      for (const r of results) gitStatus[r.path] = { status: r.status, branch: r.branch }
    },
  )
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
  selectedTools = new Set()
  onlyWithDev = false
  onlyWithReadme = false
  selectedPromotion = null
}

async function runDev(project: Project): Promise<void> {
  const url = await api.runDevServer(project)
  if (!url) return
  runningPorts[project.path] = url
  setTimeout(() => window.open(url, '_blank'), 2000)
}

async function runScript(project: Project, script: string): Promise<void> {
  const url = await api.runScript(project, script)
  if (url) runningPorts[project.path] = url
}

async function runJust(project: Project, recipe: string): Promise<void> {
  const url = await api.runJustRecipe(project, recipe)
  if (url) runningPorts[project.path] = url
}

async function doRename(newName: string): Promise<void> {
  if (!renaming) return
  await api.renameProject(renaming.path, newName)
  location.reload()
}

async function doMove(targetFolder: string): Promise<void> {
  if (!moving) return
  await api.moveProject(moving.path, `${data.baseDir}/${targetFolder}`)
  location.reload()
}
</script>

<svelte:head>
	<title>Projects ({filtered.length})</title>
</svelte:head>

{#snippet projectItem(project: Project)}
	<ProjectRow
		{project}
		git={gitStatus[project.path]}
		runningUrl={runningPorts[project.path]}
		onRunDev={runDev}
		onRunScript={runScript}
		onRunJust={runJust}
		onIterm={api.openInITerm}
		onFinder={api.openInFinder}
		onRename={(project) => (renaming = project)}
		onMove={(project) => (moving = project)}
	/>
{/snippet}

<main>
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

	{#if showFilters}
		<div class="filter-region">
			<FilterPanel
				{types}
				{frameworks}
				{runners}
				showTools={hasJust}
				bind:selectedTypes
				bind:selectedFrameworks
				bind:selectedRunners
				bind:selectedTools
				bind:onlyWithDev
				bind:onlyWithReadme
				bind:promotion={selectedPromotion}
			/>
		</div>
	{/if}

	{#if filtered.length === 0}
		<Card>
			<div class="empty">
				<p class="t-h3">No projects</p>
				<p class="t-small muted">No project matches the current search and filters.</p>
				<Button variant="primary" onclick={clearFilters}>Clear filters</Button>
			</div>
		</Card>
	{:else if viewMode === 'flat'}
		<Card flush>
			<ul class="rows">
				{#each filtered as project (project.path)}
					{@render projectItem(project)}
				{/each}
			</ul>
		</Card>
	{:else}
		<Card flush>
			{#if nestedProjects.projects.length > 0}
				<ul class="rows">
					{#each nestedProjects.projects as project (project.path)}
						{@render projectItem(project)}
					{/each}
				</ul>
			{/if}
			<FolderTree
				node={nestedProjects}
				depth={0}
				expanded={expandedFolders}
				onToggle={toggleFolder}
				row={projectItem}
			/>
		</Card>
	{/if}
</main>

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

	/* Header and toolbar travel together as one sticky band. */
	.topbar {
		position: sticky;
		top: 0;
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

	.rows {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-10) var(--space-4);
		text-align: center;
	}

	.empty p {
		margin: 0;
	}

	.empty :global(button) {
		margin-top: var(--space-2);
	}

	@media (max-width: 768px) {
		main {
			padding: 0 var(--space-4) var(--space-12);
		}
	}
</style>
