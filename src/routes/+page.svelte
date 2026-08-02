<script lang="ts">
	import type { Project, Framework, GitStatus, PromotionStatus } from '$lib/scanner';
	import { registry, getActions, getDynamicActions } from '$shared/actions';
	import type { ActionDef } from '$shared/actions';
	import { theme, toggleTheme } from '$lib/theme.svelte';
	import { onMount } from 'svelte';

	type ViewMode = 'flat' | 'nested';
	interface FolderNode {
		name: string;
		path: string;
		projects: Project[];
		children: Map<string, FolderNode>;
	}

	let { data } = $props();
	let projects = $state<Project[]>([]);
	let frameworks = $state<Framework[]>([]);
	let folders = $state<string[]>([]);
	let isRefreshing = $state(false);

	$effect(() => {
		projects = data.projects;
		frameworks = data.frameworks;
		folders = data.folders;
	});
	let search = $state('');
	let selectedFrameworks = $state<Set<Framework>>(new Set());
	let selectedTypes = $state<Set<string>>(new Set());
	let selectedRunners = $state<Set<string>>(new Set());
	let selectedTools = $state<Set<string>>(new Set());
	let onlyWithDev = $state(false);
	let onlyWithReadme = $state(false);
	let selectedPromotion = $state<string | null>(null);
	let runningPorts = $state<Record<string, string>>({});
	let editing = $state<string | null>(null);
	let editValue = $state('');
	let expandedReadme = $state<string | null>(null);
	let readmeContent = $state<Record<string, string>>({});
	let loadingReadme = $state<string | null>(null);
	let showFilters = $state(true);
	let openMenu = $state<string | null>(null);
	let openRunnerMenu = $state<string | null>(null);
	let renaming = $state<Project | null>(null);
	let renameValue = $state('');
	let moving = $state<Project | null>(null);
	let moveTarget = $state('');
	let viewMode = $state<ViewMode>('flat');
	let expandedFolders = $state<Set<string>>(new Set());
	let gitStatus = $state<Record<string, { status: GitStatus; branch?: string }>>({});

	async function refreshInBackground() {
		if (isRefreshing) return;
		isRefreshing = true;
		const res = await fetch('/api/refresh', { method: 'POST' });
		const result = await res.json();
		projects = result.projects;
		frameworks = result.frameworks;
		folders = result.folders;
		isRefreshing = false;
	}

	async function loadReadme(path: string) {
		if (readmeContent[path]) return;
		loadingReadme = path;
		const res = await fetch('/api/readme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path })
		});
		const { readme } = await res.json();
		if (readme) readmeContent[path] = readme;
		loadingReadme = null;
	}

	onMount(() => {
		// If data is stale, refresh in background
		if (data.stale) {
			refreshInBackground();
		}

		const paths = projects.map(p => p.path);
		const BATCH_SIZE = 20;

		async function loadBatch(batch: string[]) {
			const res = await fetch('/api/git', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ paths: batch })
			});
			const results = await res.json();
			for (const r of results) {
				gitStatus[r.path] = { status: r.status, branch: r.branch };
			}
		}

		for (let i = 0; i < paths.length; i += BATCH_SIZE) {
			loadBatch(paths.slice(i, i + BATCH_SIZE));
		}
	});

	const types = $derived([...new Set(projects.map(p => p.type).filter(Boolean))] as string[]);
	const runners = $derived([...new Set(projects.map(p => p.runner).filter(Boolean))] as string[]);

	const filtered = $derived(
		projects.filter(p => {
			if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
				!p.relativePath.toLowerCase().includes(search.toLowerCase()) &&
				!p.description?.toLowerCase().includes(search.toLowerCase())) return false;

			if (selectedFrameworks.size > 0 && (!p.framework || !selectedFrameworks.has(p.framework))) return false;
			if (selectedTypes.size > 0 && (!p.type || !selectedTypes.has(p.type))) return false;
			if (selectedRunners.size > 0 && (!p.runner || !selectedRunners.has(p.runner))) return false;
			if (selectedTools.has('just') && !p.hasJustfile) return false;
			if (onlyWithDev && !p.devCommand) return false;
			if (onlyWithReadme && !p.readme) return false;

			if (selectedPromotion === 'promoted' && !p.promotion) return false;
			if (selectedPromotion === 'unpromoted' && p.promotion) return false;
			if (selectedPromotion === 'in-progress' && p.promotion?.status !== 'in-progress') return false;

			return true;
		})
	);

	const activeFilterCount = $derived(
		selectedFrameworks.size + selectedTypes.size + selectedRunners.size + selectedTools.size +
		(onlyWithDev ? 1 : 0) + (onlyWithReadme ? 1 : 0) + (selectedPromotion ? 1 : 0)
	);

	const nestedProjects = $derived.by(() => {
		const root: FolderNode = { name: '', path: '', projects: [], children: new Map() };

		for (const project of filtered) {
			const parts = project.relativePath.split('/');
			const projectName = parts.pop()!;
			let current = root;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const folderPath = parts.slice(0, i + 1).join('/');
				if (!current.children.has(part)) {
					current.children.set(part, { name: part, path: folderPath, projects: [], children: new Map() });
				}
				current = current.children.get(part)!;
			}
			current.projects.push(project);
		}

		return root;
	});

	function toggleFolder(path: string) {
		const newSet = new Set(expandedFolders);
		if (newSet.has(path)) newSet.delete(path);
		else newSet.add(path);
		expandedFolders = newSet;
	}

	function expandAllFolders() {
		const paths = new Set<string>();
		function collectPaths(node: FolderNode, prefix: string) {
			for (const [name, child] of node.children) {
				const path = prefix ? `${prefix}/${name}` : name;
				paths.add(path);
				collectPaths(child, path);
			}
		}
		collectPaths(nestedProjects, '');
		expandedFolders = paths;
	}

	function collapseAllFolders() {
		expandedFolders = new Set();
	}

	function countProjects(node: FolderNode): number {
		let count = node.projects.length;
		for (const child of node.children.values()) {
			count += countProjects(child);
		}
		return count;
	}

	function toggleSet<T>(set: Set<T>, value: T): Set<T> {
		const newSet = new Set(set);
		if (newSet.has(value)) newSet.delete(value);
		else newSet.add(value);
		return newSet;
	}

	function clearFilters() {
		selectedFrameworks = new Set();
		selectedTypes = new Set();
		selectedRunners = new Set();
		selectedTools = new Set();
		onlyWithDev = false;
		onlyWithReadme = false;
		selectedPromotion = null;
	}

	const typeColors: Record<string, string> = {
		node: '#4ade80', python: '#60a5fa', swift: '#fb923c',
		rust: '#fbbf24', go: '#22d3ee', folder: '#71717a'
	};

	const frameworkColors: Record<string, string> = {
		sveltekit: '#ff3e00', svelte: '#ff3e00', next: '#a1a1aa', nuxt: '#4ade80',
		astro: '#c084fc', remix: '#a1a1aa', react: '#38bdf8', vue: '#4ade80',
		angular: '#f87171', vite: '#a78bfa', express: '#71717a', fastify: '#71717a',
		hono: '#fb923c', elysia: '#a78bfa', vapor: '#a78bfa', fastapi: '#2dd4bf', flask: '#71717a',
		django: '#4ade80', streamlit: '#f87171', tauri: '#fbbf24', electron: '#38bdf8',
		unknown: '#52525b'
	};

	async function runDev(project: Project) {
		if (!project.devCommand) return;
		const res = await fetch('/api/run', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: project.path, command: project.devCommand, runner: project.runner || 'npm' })
		});
		const result = await res.json();
		if (result.url) {
			runningPorts[project.path] = result.url;
			setTimeout(() => window.open(result.url, '_blank'), 2000);
		}
	}

	async function runJust(project: Project, recipe: string) {
		const res = await fetch('/api/run', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: project.path, command: recipe, type: 'just' })
		});
		const result = await res.json();
		if (result.url) {
			runningPorts[project.path] = result.url;
		}
	}

	async function runScript(project: Project, script: string) {
		const res = await fetch('/api/run', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: project.path, command: script, runner: project.runner || 'npm' })
		});
		const result = await res.json();
		if (result.url) {
			runningPorts[project.path] = result.url;
		}
	}

	async function openITerm(path: string) {
		await fetch('/api/iterm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
	}

	async function openFinder(path: string) {
		await fetch('/api/finder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path }) });
	}

	function startEdit(project: Project) {
		editing = project.path;
		editValue = project.description || '';
	}

	async function saveDescription(project: Project) {
		await fetch('/api/description', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: project.path, description: editValue })
		});
		project.description = editValue;
		editing = null;
	}

	function startRename(project: Project) {
		renaming = project;
		renameValue = project.name;
	}

	async function doRename() {
		if (!renaming || !renameValue) return;
		await fetch('/api/rename', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ path: renaming.path, newName: renameValue })
		});
		location.reload();
	}

	function startMove(project: Project) {
		moving = project;
		moveTarget = '';
	}

	async function doMove() {
		if (!moving || !moveTarget) return;
		await fetch('/api/move', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sourcePath: moving.path, targetDir: `${data.baseDir}/${moveTarget}` })
		});
		location.reload();
	}
</script>

<svelte:head>
	<title>Projects ({filtered.length})</title>
</svelte:head>

<main>
	<header>
		<h1>Projects</h1>
		<span class="count">{filtered.length} <span class="total">/ {projects.length}</span></span>
		{#if isRefreshing}
			<span class="refreshing">Refreshing...</span>
		{/if}
		<button class="theme-toggle" onclick={toggleTheme} aria-label="Toggle theme" title="Toggle light / dark">{theme.mode === 'dark' ? '☀' : '☾'}</button>
	</header>

	<div class="search-row">
		<input type="search" bind:value={search} placeholder="Search projects..." />
		<div class="view-toggle">
			<button class:active={viewMode === 'flat'} onclick={() => viewMode = 'flat'}>Flat</button>
			<button class:active={viewMode === 'nested'} onclick={() => viewMode = 'nested'}>Nested</button>
		</div>
		{#if viewMode === 'nested'}
			<button onclick={expandAllFolders}>Expand all</button>
			<button onclick={collapseAllFolders}>Collapse all</button>
		{/if}
		<button class="toggle-filters" onclick={() => showFilters = !showFilters}>
			Filters {#if activeFilterCount > 0}<span class="badge">{activeFilterCount}</span>{/if}
		</button>
		{#if activeFilterCount > 0}
			<button class="clear" onclick={clearFilters}>Clear all</button>
		{/if}
	</div>

	{#if showFilters}
		<div class="filters">
			<div class="filter-group">
				<div class="filter-label">Type</div>
				<div class="chips">
					{#each types as type}
						<button
							class="chip"
							class:active={selectedTypes.has(type)}
							style="--color: {typeColors[type] || '#888'}"
							onclick={() => selectedTypes = toggleSet(selectedTypes, type)}
						>{type}</button>
					{/each}
				</div>
			</div>

			<div class="filter-group">
				<div class="filter-label">Framework</div>
				<div class="chips">
					{#each frameworks.filter(f => f !== 'unknown') as fw}
						<button
							class="chip"
							class:active={selectedFrameworks.has(fw)}
							style="--color: {frameworkColors[fw] || '#888'}"
							onclick={() => selectedFrameworks = toggleSet(selectedFrameworks, fw)}
						>{fw}</button>
					{/each}
				</div>
			</div>

			<div class="filter-group">
				<div class="filter-label">Runner</div>
				<div class="chips">
					{#each runners as runner}
						<button
							class="chip"
							class:active={selectedRunners.has(runner)}
							onclick={() => selectedRunners = toggleSet(selectedRunners, runner)}
						>{runner}</button>
					{/each}
				</div>
			</div>

			{#if projects.some(p => p.hasJustfile)}
				<div class="filter-group">
					<div class="filter-label">Tools</div>
					<div class="chips">
						<button
							class="chip"
							class:active={selectedTools.has('just')}
							style="--color: #fbbf24"
							onclick={() => selectedTools = toggleSet(selectedTools, 'just')}
						>just</button>
					</div>
				</div>
			{/if}

			<div class="filter-group">
				<div class="filter-label">Features</div>
				<div class="chips">
					<button class="chip" class:active={onlyWithDev} onclick={() => onlyWithDev = !onlyWithDev}>Has dev command</button>
					<button class="chip" class:active={onlyWithReadme} onclick={() => onlyWithReadme = !onlyWithReadme}>Has README</button>
				</div>
			</div>

			<div class="filter-group">
				<div class="filter-label">Promotion</div>
				<div class="chips">
					<button class="chip" class:active={selectedPromotion === 'promoted'} style="--color: #4ade80" onclick={() => selectedPromotion = selectedPromotion === 'promoted' ? null : 'promoted'}>Promoted</button>
					<button class="chip" class:active={selectedPromotion === 'unpromoted'} style="--color: #71717a" onclick={() => selectedPromotion = selectedPromotion === 'unpromoted' ? null : 'unpromoted'}>Unpromoted</button>
					<button class="chip" class:active={selectedPromotion === 'in-progress'} style="--color: #fbbf24" onclick={() => selectedPromotion = selectedPromotion === 'in-progress' ? null : 'in-progress'}>In Progress</button>
				</div>
			</div>
		</div>
	{/if}

	{#snippet projectItem(project: Project)}
		{@const git = gitStatus[project.path]}
		{@const svelteActions = getActions(project, 'svelte')}
		<li class="project-card" data-git={git?.status}>
			<div class="header">
				{#if project.promotion}
					<span class="promotion-badge" data-status={project.promotion.status} title="Promotion: {project.promotion.status}"></span>
				{/if}
				<span class="type" style="background: {typeColors[project.type ?? 'folder']}">{project.type}</span>
				{#if project.framework && project.framework !== 'unknown'}
					<span class="framework" style="background: {frameworkColors[project.framework]}">{project.framework}</span>
				{/if}
				{#if project.runner}
					<span class="runner">{project.runner}</span>
				{/if}
			</div>

			<div class="project-title">
				<span class="git-status" data-status={git?.status ?? 'loading'} title={git?.status === 'dirty' ? 'Uncommitted changes' : git?.status === 'clean' ? 'Clean working tree' : git?.status === 'no-repo' ? 'Not a git repository' : git?.status === 'error' ? 'Git error' : 'Loading...'}></span>
				<strong>{project.name}</strong>
				{#if git?.branch}
					<span class="git-branch">{git.branch}</span>
				{/if}
			</div>
			<code class="path">{project.relativePath}</code>

			{#if editing === project.path}
				<div class="edit-desc">
					<input type="text" bind:value={editValue} onkeydown={(e) => e.key === 'Enter' && saveDescription(project)} />
					<button onclick={() => saveDescription(project)}>Save</button>
					<button onclick={() => editing = null}>Cancel</button>
				</div>
			{:else}
				<p class="desc" ondblclick={() => startEdit(project)}>
					{project.description || 'No description'}
				</p>
			{/if}

			{#if project.readme}
				<button class="readme-toggle" onclick={() => {
					if (expandedReadme === project.path) {
						expandedReadme = null;
					} else {
						expandedReadme = project.path;
						loadReadme(project.path);
					}
				}}>
					{expandedReadme === project.path ? 'Hide' : 'Show'} README
				</button>
				{#if expandedReadme === project.path}
					{#if loadingReadme === project.path}
						<pre class="readme">Loading...</pre>
					{:else if readmeContent[project.path]}
						<pre class="readme">{readmeContent[project.path]}</pre>
					{/if}
				{/if}
			{/if}

			{#if project.scripts && Object.keys(project.scripts).length > 0}
				<div class="runner-dropdown">
					<button class="runner-trigger script-trigger" onclick={() => openRunnerMenu = openRunnerMenu === `scripts:${project.path}` ? null : `scripts:${project.path}`}>
						{project.runner || 'npm'} <span class="runner-count">{Object.keys(project.scripts).length}</span>
					</button>
					{#if openRunnerMenu === `scripts:${project.path}`}
						<div class="runner-menu">
							{#each Object.keys(project.scripts) as script}
								<button class="runner-item script" onclick={() => { runScript(project, script); openRunnerMenu = null; }}>{script}</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#if project.justRecipes?.length}
				<div class="runner-dropdown">
					<button class="runner-trigger just-trigger" onclick={() => openRunnerMenu = openRunnerMenu === `just:${project.path}` ? null : `just:${project.path}`}>
						just <span class="runner-count">{project.justRecipes.length}</span>
					</button>
					{#if openRunnerMenu === `just:${project.path}`}
						<div class="runner-menu">
							{#each project.justRecipes as recipe}
								<button class="runner-item recipe" onclick={() => { runJust(project, recipe); openRunnerMenu = null; }}>{recipe}</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#if project.domains?.length || project.umami}
				<div class="web-links">
					{#each project.domains ?? [] as domain}
						<a href="https://{domain}" target="_blank" rel="noreferrer" class="domain">{domain}</a>
					{/each}
					{#if project.umami?.instance}
						{#each project.umami.websiteIds as websiteId}
							<a href="{project.umami.instance}/websites/{websiteId}" target="_blank" rel="noreferrer" class="umami" title="Umami · {websiteId}">umami</a>
						{/each}
					{/if}
				</div>
			{/if}

			<div class="actions">
				{#each svelteActions as action (action.id)}
					{#if action.id === 'run-dev' && project.devCommand}
						<button onclick={() => runDev(project)}>Run {project.devCommand}</button>
					{:else if action.id === 'open-iterm'}
						<button onclick={() => openITerm(project.path)}>{action.label.replace('Open in ', '')}</button>
					{:else if action.id === 'open-finder'}
						<button onclick={() => openFinder(project.path)}>{action.label.replace('Open in ', '')}</button>
					{:else if action.id === 'rename'}
						<!-- rendered in menu below -->
					{:else if action.id === 'move'}
						<!-- rendered in menu below -->
					{:else if action.id === 'refresh'}
						<!-- handled at page level -->
					{/if}
				{/each}
				<button
					class="tree-btn"
					title="View the CLAUDE.md tree for this project"
					onclick={() => window.open(`/claude-tree?root=${encodeURIComponent(project.path)}`, '_blank')}
				>Tree</button>
				<div class="menu-container">
					<button class="menu-trigger" onclick={() => openMenu = openMenu === project.path ? null : project.path}>⋯</button>
					{#if openMenu === project.path}
						<div class="menu-dropdown">
							{#if svelteActions.some(a => a.id === 'rename')}
								<button onclick={() => { startRename(project); openMenu = null; }}>Rename</button>
							{/if}
							{#if svelteActions.some(a => a.id === 'move')}
								<button onclick={() => { startMove(project); openMenu = null; }}>Move</button>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			{#if runningPorts[project.path]}
				<a href={runningPorts[project.path]} target="_blank" class="running">{runningPorts[project.path]}</a>
			{/if}

			<time>{new Date(project.modifiedAt).toLocaleDateString()}</time>
		</li>
	{/snippet}

	{#snippet folderTree(node: FolderNode, depth: number)}
		{#each [...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0])) as [name, child]}
			<div class="folder" style="--depth: {depth}">
				<button class="folder-toggle" onclick={() => toggleFolder(child.path)}>
					<span class="folder-icon">{expandedFolders.has(child.path) ? '📂' : '📁'}</span>
					<span class="folder-name">{name}</span>
					<span class="folder-count">{countProjects(child)}</span>
				</button>
				{#if expandedFolders.has(child.path)}
					<ul class="projects nested">
						{#each child.projects as project}
							{@render projectItem(project)}
						{/each}
					</ul>
					{@render folderTree(child, depth + 1)}
				{/if}
			</div>
		{/each}
	{/snippet}

	{#if viewMode === 'flat'}
		<ul class="projects">
			{#each filtered as project}
				{@render projectItem(project)}
			{/each}
		</ul>
	{:else}
		<div class="nested-view">
			<ul class="projects nested root-projects">
				{#each nestedProjects.projects as project}
					{@render projectItem(project)}
				{/each}
			</ul>
			{@render folderTree(nestedProjects, 0)}
		</div>
	{/if}
</main>

{#if renaming}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={() => renaming = null}
		onkeydown={(e) => e.key === 'Escape' && (renaming = null)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h3>Rename "{renaming.name}"</h3>
			<input type="text" bind:value={renameValue} onkeydown={(e) => e.key === 'Enter' && doRename()} />
			<div class="modal-actions">
				<button onclick={doRename}>Rename</button>
				<button onclick={() => renaming = null}>Cancel</button>
			</div>
		</div>
	</div>
{/if}

{#if moving}
	<div
		class="modal-backdrop"
		role="presentation"
		onclick={() => moving = null}
		onkeydown={(e) => e.key === 'Escape' && (moving = null)}
	>
		<div
			class="modal"
			role="dialog"
			aria-modal="true"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<h3>Move "{moving.name}" to</h3>
			<select bind:value={moveTarget}>
				<option value="">Select folder...</option>
				{#each folders as folder}
					<option value={folder}>{folder}</option>
				{/each}
			</select>
			<div class="modal-actions">
				<button onclick={doMove} disabled={!moveTarget}>Move</button>
				<button onclick={() => moving = null}>Cancel</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* === DESIGN TOKENS === */
	main {
		--bg-base: var(--color-bg);
		--bg-elevated: var(--color-bg-elev);
		--bg-surface: var(--color-card-2);
		--bg-hover: var(--color-card);
		--border: var(--color-border);
		--border-hover: var(--color-border-strong);
		--text-primary: var(--color-fg);
		--text-secondary: var(--color-fg-2);
		--text-muted: var(--color-muted);
		--accent-cyan: var(--color-accent);
		--accent-green: var(--color-pos);
		--accent-amber: var(--color-warn);
		--accent-red: var(--color-neg);
		--accent-purple: var(--chart-6);

		width: 100%;
		min-height: 100vh;
		padding: 1.5rem 2rem;
		position: relative;
	}

	/* === HEADER === */
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: -1.5rem -2rem 1.5rem;
		padding: 1rem 2rem;
		background: var(--bg-elevated);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 50;
	}

	h1 {
		font-family: var(--font-sans);
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);
		letter-spacing: -0.02em;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	h1::before {
		content: '';
		width: 8px;
		height: 8px;
		border-radius: 2px;
		background: var(--color-accent);
		transform: rotate(45deg);
	}

	.refreshing {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--accent-cyan);
		animation: pulse-loading 1s ease-in-out infinite;
	}

	.count {
		font-family: var(--font-display);
		font-size: 1.5rem;
		line-height: 1;
		color: var(--text-primary);
		padding: 0 0.25rem;
	}

	.count .total {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.theme-toggle {
		margin-left: auto;
		width: 32px;
		padding: 0.5rem;
		font-size: 0.875rem;
	}

	/* === SEARCH ROW === */
	.search-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
		position: sticky;
		top: 52px;
		z-index: 40;
		background: var(--bg-base);
		margin-left: -2rem;
		margin-right: -2rem;
		padding: 0.75rem 2rem;
		border-bottom: 1px solid var(--border);
	}

	input[type="search"] {
		flex: 1;
		min-width: 200px;
		padding: 0.625rem 0.875rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	input[type="search"]::placeholder {
		color: var(--text-muted);
	}

	input[type="search"]:focus {
		border-color: var(--color-ring);
		box-shadow: 0 0 0 3px var(--color-accent-soft);
	}

	/* === BUTTONS === */
	button {
		font-family: var(--font-sans);
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.5rem 0.875rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s;
	}

	button:hover {
		background: var(--bg-hover);
		border-color: var(--border-hover);
		color: var(--text-primary);
	}

	.toggle-filters {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.badge {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		background: var(--color-accent);
		color: var(--color-accent-fg);
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-full);
		font-weight: 600;
	}

	.clear {
		border-color: var(--accent-red);
		color: var(--accent-red);
	}

	.clear:hover {
		background: var(--accent-red);
		color: var(--bg-base);
	}

	/* === VIEW TOGGLE === */
	.view-toggle {
		display: flex;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.view-toggle button {
		border: none;
		border-radius: 0;
		padding: 0.5rem 0.75rem;
	}

	.view-toggle button:first-child {
		border-right: 1px solid var(--border);
	}

	.view-toggle button.active {
		background: var(--color-accent);
		color: var(--color-accent-fg);
	}

	/* === FILTERS === */
	.filters {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1rem;
		margin-bottom: 1.5rem;
		display: grid;
		gap: 1rem;
	}

	.filter-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		font-weight: 500;
		color: var(--text-muted);
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.chip {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		padding: 0.25rem 0.625rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s;
	}

	.chip:hover {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}

	.chip.active {
		background: var(--color, var(--color-accent));
		color: #ffffff;
		border-color: transparent;
	}

	/* === PROJECT LIST === */
	.projects {
		list-style: none;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(410px, 1fr));
		gap: 0.75rem;
	}

	li {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1rem 1.25rem;
		position: relative;
		transition: all 0.2s;
		height: 300px;
		display: flex;
		flex-direction: column;
	}

	li::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		border-top-left-radius: var(--radius-lg);
		border-bottom-left-radius: var(--radius-lg);
		background: var(--color-accent);
		opacity: 0;
		transition: opacity 0.2s;
	}

	li:hover {
		border-color: var(--border-hover);
		background: var(--color-card);
	}

	li:hover::before {
		opacity: 1;
	}

	.header {
		display: flex;
		gap: 0.375rem;
		justify-content: flex-end;
		margin-bottom: 0.5rem;
	}

	.type, .runner, .framework {
		font-family: var(--font-mono);
		font-size: 0.5625rem;
		font-weight: 600;
		padding: 0.1875rem 0.375rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border: 1px solid transparent;
		border-radius: var(--radius-xs);
	}

	.type {
		color: #ffffff;
	}

	.framework {
		color: #ffffff;
	}

	.runner {
		background: transparent;
		border-color: var(--text-muted);
		color: var(--text-muted);
	}

	/* === PROMOTION BADGE === */
	.promotion-badge {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-right: auto;
	}

	.promotion-badge[data-status="published"] {
		background: var(--color-pos);
	}

	.promotion-badge[data-status="ready"] {
		background: var(--color-pos);
	}

	.promotion-badge[data-status="in-progress"] {
		background: var(--color-warn);
	}

	.promotion-badge[data-status="draft"] {
		background: var(--chart-6);
	}

	.promotion-badge[data-status="none"] {
		background: var(--text-muted);
		opacity: 0.5;
	}

	strong {
		font-family: var(--font-sans);
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	/* === GIT STATUS === */
	.project-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.git-status {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.git-status[data-status="clean"] {
		background: var(--status-clean);
	}

	.git-status[data-status="dirty"] {
		background: var(--status-dirty);
	}

	.git-status[data-status="no-repo"] {
		background: var(--text-muted);
		opacity: 0.5;
	}

	.git-status[data-status="error"] {
		background: var(--status-error);
	}

	.git-status[data-status="loading"] {
		background: var(--text-muted);
		opacity: 0.3;
		animation: pulse-loading 1s ease-in-out infinite;
	}

	@keyframes pulse-loading {
		0%, 100% { opacity: 0.3; }
		50% { opacity: 0.6; }
	}

	.git-branch {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--text-muted);
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.125rem 0.375rem;
		margin-left: auto;
	}

	/* Dirty project cards get an amber left border */
	.project-card[data-git="dirty"]::before {
		background: var(--status-dirty) !important;
		opacity: 1 !important;
	}

	.path {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		color: var(--text-muted);
		margin: 0.25rem 0 0.5rem;
	}

	.desc {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		margin: 0 0 0.75rem;
		cursor: pointer;
		padding: 0.25rem 0;
		flex: 1;
		overflow: hidden;
	}

	.desc:hover {
		color: var(--text-primary);
	}

	.edit-desc {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.edit-desc input {
		flex: 1;
		padding: 0.375rem 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		outline: none;
	}

	.edit-desc input:focus {
		border-color: var(--color-ring);
		box-shadow: 0 0 0 3px var(--color-accent-soft);
	}

	/* === README === */
	.readme-toggle {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		padding: 0.25rem 0.5rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
	}

	.readme-toggle:hover {
		color: var(--color-accent);
		border-color: var(--color-accent);
	}

	.readme {
		margin: 0.75rem 0;
		padding: 1rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-secondary);
		max-height: 300px;
		overflow: auto;
		white-space: pre-wrap;
		line-height: 1.6;
	}


	/* === RUNNER DROPDOWNS === */
	.runner-dropdown {
		position: relative;
		display: inline-block;
		margin: 0.375rem 0.25rem 0.375rem 0;
	}

	.runner-trigger {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface);
		color: var(--text-secondary);
		transition: all 0.15s;
	}

	.script-trigger {
		color: var(--color-pos);
		border-color: var(--color-pos);
	}

	.script-trigger:hover {
		background: var(--color-pos);
		color: #ffffff;
		border-color: var(--color-pos);
	}

	.just-trigger {
		color: var(--color-warn);
		border-color: var(--color-warn);
	}

	.just-trigger:hover {
		background: var(--color-warn);
		color: #ffffff;
		border-color: var(--color-warn);
	}

	.runner-count {
		font-size: 0.5625rem;
		opacity: 0.7;
	}

	.runner-menu {
		position: absolute;
		bottom: 100%;
		left: 0;
		margin-bottom: 0.25rem;
		background: var(--color-bg-elev);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
		min-width: 140px;
		max-height: 200px;
		overflow-y: auto;
		z-index: 20;
	}

	.runner-item {
		display: block;
		width: 100%;
		text-align: left;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		padding: 0.375rem 0.625rem;
		border: none;
		border-radius: 0;
		border-bottom: 1px solid var(--border);
		background: transparent;
		cursor: pointer;
		text-transform: none;
		letter-spacing: normal;
	}

	.runner-item:last-child {
		border-bottom: none;
	}

	.runner-item:hover {
		background: var(--bg-hover);
	}

	.runner-item.script {
		color: var(--color-pos);
	}

	.runner-item.script:hover {
		background: var(--color-pos);
		color: #ffffff;
	}

	.runner-item.recipe {
		color: var(--color-warn);
	}

	.runner-item.recipe:hover {
		background: var(--color-warn);
		color: #ffffff;
	}

	/* === ACTIONS === */
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: auto;
		padding-top: 0.75rem;
		border-top: 1px solid var(--border);
	}

	.actions button:first-child {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-accent-fg);
	}

	.actions button:first-child:hover {
		background: var(--color-accent);
		border-color: var(--color-accent);
		filter: brightness(1.08);
	}

	/* === THREE DOT MENU === */
	.menu-container {
		position: relative;
		margin-left: auto;
	}

	.menu-trigger {
		width: 32px;
		padding: 0.5rem;
		font-size: 1rem;
		letter-spacing: 0.1em;
	}

	.menu-dropdown {
		position: absolute;
		bottom: 100%;
		right: 0;
		margin-bottom: 0.25rem;
		background: var(--color-bg-elev);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
		min-width: 100px;
		z-index: 20;
	}

	.menu-dropdown button {
		display: block;
		width: 100%;
		text-align: left;
		border: none;
		border-radius: 0;
		border-bottom: 1px solid var(--border);
	}

	.menu-dropdown button:last-child {
		border-bottom: none;
	}

	/* === RUNNING STATUS === */
	.web-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: 0.5rem;
	}

	.web-links a {
		padding: 0.125rem 0.375rem;
		border: 1px solid var(--color-border);
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-muted);
		text-decoration: none;
	}

	.web-links a:hover {
		color: var(--color-fg);
		border-color: var(--color-border-strong);
	}

	.web-links .umami {
		color: var(--color-accent);
	}

	.running {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-pos);
		text-decoration: none;
	}

	.running::before {
		content: '';
		width: 6px;
		height: 6px;
		background: var(--color-pos);
		border-radius: 50%;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.5; transform: scale(1.2); }
	}

	time {
		position: absolute;
		bottom: 0.625rem;
		right: 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--text-muted);
	}

	/* === MODALS === */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: var(--color-overlay);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background: var(--color-bg-elev);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		min-width: 340px;
		max-width: 420px;
		box-shadow: var(--shadow-lg);
	}

	.modal h3 {
		font-family: var(--font-sans);
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 1rem;
	}

	.modal input, .modal select {
		width: 100%;
		padding: 0.625rem 0.75rem;
		font-family: var(--font-mono);
		font-size: 0.875rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-primary);
		margin-bottom: 1rem;
		outline: none;
	}

	.modal input:focus, .modal select:focus {
		border-color: var(--color-ring);
		box-shadow: 0 0 0 3px var(--color-accent-soft);
	}

	.modal select {
		cursor: pointer;
	}

	.modal select option {
		background: var(--color-bg-elev);
		color: var(--text-primary);
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.modal-actions button:first-child {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-accent-fg);
	}

	.modal-actions button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* === NESTED VIEW === */
	.nested-view {
		display: grid;
		gap: 0.5rem;
	}

	.folder {
		margin-left: calc(var(--depth) * 1.25rem);
	}

	.folder-toggle {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: all 0.15s;
	}

	.folder-toggle:hover {
		background: var(--bg-hover);
		border-color: var(--border-hover);
	}

	.folder-icon {
		font-size: 0.875rem;
		filter: grayscale(1);
		opacity: 0.7;
	}

	.folder-name {
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-primary);
		flex: 1;
	}

	.folder-count {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: var(--text-muted);
		background: var(--color-bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		padding: 0.125rem 0.375rem;
	}

	.projects.nested {
		margin-left: calc(var(--depth, 0) * 1.25rem + 1.25rem);
		margin-top: 0.5rem;
		margin-bottom: 0.5rem;
		border-left: 1px solid var(--border);
		padding-left: 0.75rem;
	}

	.projects.nested.root-projects {
		margin-left: 0;
		border-left: none;
		padding-left: 0;
	}

	/* === SCROLLBAR === */
	::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}

	::-webkit-scrollbar-track {
		background: var(--color-bg);
	}

	::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: var(--radius-full);
	}

	::-webkit-scrollbar-thumb:hover {
		background: var(--color-border-strong);
	}
</style>
