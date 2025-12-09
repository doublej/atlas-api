<script lang="ts">
	import type { Project, Framework, GitStatus } from '$lib/scanner';
	import { onMount } from 'svelte';

	type ViewMode = 'flat' | 'nested';
	interface FolderNode {
		name: string;
		path: string;
		projects: Project[];
		children: Map<string, FolderNode>;
	}

	let { data } = $props();
	let projects = $state(data.projects);
	let frameworks = $state(data.frameworks);
	let folders = $state(data.folders);
	let isRefreshing = $state(false);
	let search = $state('');
	let selectedFrameworks = $state<Set<Framework>>(new Set());
	let selectedTypes = $state<Set<string>>(new Set());
	let selectedRunners = $state<Set<string>>(new Set());
	let onlyWithDev = $state(false);
	let onlyWithReadme = $state(false);
	let runningPorts = $state<Record<string, string>>({});
	let editing = $state<string | null>(null);
	let editValue = $state('');
	let expandedReadme = $state<string | null>(null);
	let readmeContent = $state<Record<string, string>>({});
	let loadingReadme = $state<string | null>(null);
	let showFilters = $state(true);
	let openMenu = $state<string | null>(null);
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
			if (onlyWithDev && !p.devCommand) return false;
			if (onlyWithReadme && !p.readme) return false;

			return true;
		})
	);

	const activeFilterCount = $derived(
		selectedFrameworks.size + selectedTypes.size + selectedRunners.size +
		(onlyWithDev ? 1 : 0) + (onlyWithReadme ? 1 : 0)
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
		onlyWithDev = false;
		onlyWithReadme = false;
	}

	const typeColors: Record<string, string> = {
		node: '#4ade80', python: '#60a5fa', swift: '#fb923c',
		rust: '#fbbf24', go: '#22d3ee', folder: '#71717a'
	};

	const frameworkColors: Record<string, string> = {
		sveltekit: '#ff3e00', svelte: '#ff3e00', next: '#a1a1aa', nuxt: '#4ade80',
		astro: '#c084fc', remix: '#a1a1aa', react: '#38bdf8', vue: '#4ade80',
		angular: '#f87171', vite: '#a78bfa', express: '#71717a', fastify: '#71717a',
		hono: '#fb923c', elysia: '#a78bfa', fastapi: '#2dd4bf', flask: '#71717a',
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
		<span class="count">{filtered.length} / {projects.length}</span>
		{#if isRefreshing}
			<span class="refreshing">Refreshing...</span>
		{/if}
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
				<label>Type</label>
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
				<label>Framework</label>
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
				<label>Runner</label>
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

			<div class="filter-group">
				<label>Features</label>
				<div class="chips">
					<button class="chip" class:active={onlyWithDev} onclick={() => onlyWithDev = !onlyWithDev}>Has dev command</button>
					<button class="chip" class:active={onlyWithReadme} onclick={() => onlyWithReadme = !onlyWithReadme}>Has README</button>
				</div>
			</div>
		</div>
	{/if}

	{#snippet projectItem(project: Project)}
		{@const git = gitStatus[project.path]}
		<li class="project-card" data-git={git?.status}>
			<div class="header">
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

			{#if project.scripts}
				<div class="scripts">
					{#each Object.keys(project.scripts).slice(0, 6) as script}
						<span class="script">{script}</span>
					{/each}
				</div>
			{/if}

			<div class="actions">
				{#if project.devCommand}
					<button onclick={() => runDev(project)}>Run {project.devCommand}</button>
				{/if}
				<button onclick={() => openITerm(project.path)}>iTerm</button>
				<button onclick={() => openFinder(project.path)}>Finder</button>
				<div class="menu-container">
					<button class="menu-trigger" onclick={() => openMenu = openMenu === project.path ? null : project.path}>⋯</button>
					{#if openMenu === project.path}
						<div class="menu-dropdown">
							<button onclick={() => { startRename(project); openMenu = null; }}>Rename</button>
							<button onclick={() => { startMove(project); openMenu = null; }}>Move</button>
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
	<div class="modal-backdrop" onclick={() => renaming = null}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
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
	<div class="modal-backdrop" onclick={() => moving = null}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
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
		--bg-base: #0a0a0b;
		--bg-elevated: #131316;
		--bg-surface: #1a1a1f;
		--bg-hover: #222228;
		--border: #2a2a32;
		--border-hover: #3a3a44;
		--text-primary: #e4e4e7;
		--text-secondary: #a1a1aa;
		--text-muted: #71717a;
		--accent-cyan: #22d3ee;
		--accent-green: #4ade80;
		--accent-amber: #fbbf24;
		--accent-red: #f87171;
		--accent-purple: #a78bfa;

		width: 100%;
		min-height: 100vh;
		padding: 1.5rem 2rem;
		position: relative;
	}

	/* Subtle grid background */
	main::before {
		content: '';
		position: fixed;
		inset: 0;
		background-image:
			linear-gradient(var(--border) 1px, transparent 1px),
			linear-gradient(90deg, var(--border) 1px, transparent 1px);
		background-size: 50px 50px;
		opacity: 0.3;
		pointer-events: none;
		z-index: -1;
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
		font-family: 'IBM Plex Mono', monospace;
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);
		letter-spacing: -0.02em;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	h1::before {
		content: '>';
		color: var(--accent-cyan);
		animation: blink 1s step-end infinite;
	}

	@keyframes blink {
		50% { opacity: 0; }
	}

	.refreshing {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		color: var(--accent-cyan);
		animation: pulse-loading 1s ease-in-out infinite;
	}

	.count {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.75rem;
		color: var(--text-muted);
		background: var(--bg-surface);
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border);
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
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.875rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		color: var(--text-primary);
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	input[type="search"]::placeholder {
		color: var(--text-muted);
	}

	input[type="search"]:focus {
		border-color: var(--accent-cyan);
		box-shadow: 0 0 0 1px var(--accent-cyan), 0 0 20px -5px var(--accent-cyan);
	}

	/* === BUTTONS === */
	button {
		font-family: 'IBM Plex Sans', sans-serif;
		font-size: 0.75rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding: 0.5rem 0.875rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
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
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		background: var(--accent-cyan);
		color: var(--bg-base);
		padding: 0.125rem 0.375rem;
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
		overflow: hidden;
	}

	.view-toggle button {
		border: none;
		padding: 0.5rem 0.75rem;
	}

	.view-toggle button:first-child {
		border-right: 1px solid var(--border);
	}

	.view-toggle button.active {
		background: var(--accent-cyan);
		color: var(--bg-base);
	}

	/* === FILTERS === */
	.filters {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		padding: 1rem;
		margin-bottom: 1.5rem;
		display: grid;
		gap: 1rem;
	}

	.filter-group label {
		display: block;
		font-family: 'IBM Plex Mono', monospace;
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
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.6875rem;
		padding: 0.25rem 0.5rem;
		background: var(--bg-surface);
		border: 1px solid var(--border);
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s;
		text-transform: lowercase;
	}

	.chip:hover {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}

	.chip.active {
		background: var(--color, var(--accent-cyan));
		color: var(--bg-base);
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
		background: var(--accent-cyan);
		opacity: 0;
		transition: opacity 0.2s;
	}

	li:hover {
		border-color: var(--border-hover);
		background: var(--bg-surface);
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
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.5625rem;
		font-weight: 600;
		padding: 0.1875rem 0.375rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border: 1px solid transparent;
	}

	.type {
		color: var(--bg-base);
	}

	.framework {
		color: var(--bg-base);
	}

	.runner {
		background: transparent;
		border-color: var(--text-muted);
		color: var(--text-muted);
	}

	strong {
		font-family: 'IBM Plex Sans', sans-serif;
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
		background: var(--accent-green);
		box-shadow: 0 0 6px var(--accent-green);
	}

	.git-status[data-status="dirty"] {
		background: var(--accent-amber);
		box-shadow: 0 0 6px var(--accent-amber);
		animation: pulse-amber 2s ease-in-out infinite;
	}

	.git-status[data-status="no-repo"] {
		background: var(--text-muted);
		opacity: 0.5;
	}

	.git-status[data-status="error"] {
		background: var(--accent-red);
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

	@keyframes pulse-amber {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.git-branch {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		color: var(--text-muted);
		background: var(--bg-base);
		border: 1px solid var(--border);
		padding: 0.125rem 0.375rem;
		margin-left: auto;
	}

	/* Dirty project cards get amber left border */
	.project-card[data-git="dirty"]::before {
		background: var(--accent-amber) !important;
		opacity: 1 !important;
	}

	.path {
		display: block;
		font-family: 'IBM Plex Mono', monospace;
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
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.8125rem;
		background: var(--bg-base);
		border: 1px solid var(--border);
		color: var(--text-primary);
		outline: none;
	}

	.edit-desc input:focus {
		border-color: var(--accent-cyan);
	}

	/* === README === */
	.readme-toggle {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		padding: 0.25rem 0.5rem;
		background: var(--bg-base);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}

	.readme-toggle:hover {
		color: var(--accent-cyan);
		border-color: var(--accent-cyan);
	}

	.readme {
		margin: 0.75rem 0;
		padding: 1rem;
		background: var(--bg-base);
		border: 1px solid var(--border);
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.75rem;
		color: var(--text-secondary);
		max-height: 300px;
		overflow: auto;
		white-space: pre-wrap;
		line-height: 1.6;
	}

	/* === SCRIPTS === */
	.scripts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0.5rem 0;
	}

	.script {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		padding: 0.125rem 0.375rem;
		background: var(--bg-base);
		border: 1px solid var(--border);
		color: var(--accent-green);
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
		background: var(--accent-green);
		border-color: var(--accent-green);
		color: var(--bg-base);
	}

	.actions button:first-child:hover {
		background: #22c55e;
		border-color: #22c55e;
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
		background: var(--bg-surface);
		border: 1px solid var(--border);
		min-width: 100px;
		z-index: 20;
	}

	.menu-dropdown button {
		display: block;
		width: 100%;
		text-align: left;
		border: none;
		border-bottom: 1px solid var(--border);
	}

	.menu-dropdown button:last-child {
		border-bottom: none;
	}

	/* === RUNNING STATUS === */
	.running {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.75rem;
		color: var(--accent-green);
		text-decoration: none;
	}

	.running::before {
		content: '';
		width: 6px;
		height: 6px;
		background: var(--accent-green);
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
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		color: var(--text-muted);
	}

	/* === MODALS === */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.8);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		padding: 1.5rem;
		min-width: 340px;
		max-width: 420px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
	}

	.modal h3 {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
		margin: 0 0 1rem;
	}

	.modal input, .modal select {
		width: 100%;
		padding: 0.625rem 0.75rem;
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.875rem;
		background: var(--bg-base);
		border: 1px solid var(--border);
		color: var(--text-primary);
		margin-bottom: 1rem;
		outline: none;
	}

	.modal input:focus, .modal select:focus {
		border-color: var(--accent-cyan);
	}

	.modal select {
		cursor: pointer;
	}

	.modal select option {
		background: var(--bg-base);
		color: var(--text-primary);
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.modal-actions button:first-child {
		background: var(--accent-cyan);
		border-color: var(--accent-cyan);
		color: var(--bg-base);
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
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-primary);
		flex: 1;
	}

	.folder-count {
		font-family: 'IBM Plex Mono', monospace;
		font-size: 0.625rem;
		color: var(--text-muted);
		background: var(--bg-base);
		border: 1px solid var(--border);
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
		background: var(--bg-base);
	}

	::-webkit-scrollbar-thumb {
		background: var(--border);
	}

	::-webkit-scrollbar-thumb:hover {
		background: var(--border-hover);
	}
</style>
