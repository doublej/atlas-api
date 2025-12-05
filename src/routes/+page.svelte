<script lang="ts">
	import type { Project, Framework } from '$lib/scanner';

	type ViewMode = 'flat' | 'nested';
	interface FolderNode {
		name: string;
		path: string;
		projects: Project[];
		children: Map<string, FolderNode>;
	}

	let { data } = $props();
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
	let showFilters = $state(true);
	let renaming = $state<Project | null>(null);
	let renameValue = $state('');
	let moving = $state<Project | null>(null);
	let moveTarget = $state('');
	let viewMode = $state<ViewMode>('flat');
	let expandedFolders = $state<Set<string>>(new Set());

	const types = $derived([...new Set(data.projects.map(p => p.type).filter(Boolean))] as string[]);
	const runners = $derived([...new Set(data.projects.map(p => p.runner).filter(Boolean))] as string[]);

	const filtered = $derived(
		data.projects.filter(p => {
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
		node: '#68a063', python: '#3776ab', swift: '#fa7343',
		rust: '#dea584', go: '#00add8', folder: '#888'
	};

	const frameworkColors: Record<string, string> = {
		sveltekit: '#ff3e00', svelte: '#ff3e00', next: '#000', nuxt: '#00dc82',
		astro: '#bc52ee', remix: '#121212', react: '#61dafb', vue: '#42b883',
		angular: '#dd0031', vite: '#646cff', express: '#000', fastify: '#000',
		hono: '#ff5b00', elysia: '#7c3aed', fastapi: '#009688', flask: '#000',
		django: '#092e20', streamlit: '#ff4b4b', tauri: '#ffc131', electron: '#47848f',
		unknown: '#888'
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
		<span class="count">{filtered.length} / {data.projects.length}</span>
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
					{#each data.frameworks.filter(f => f !== 'unknown') as fw}
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
		<li>
			<div class="header">
				<span class="type" style="background: {typeColors[project.type ?? 'folder']}">{project.type}</span>
				{#if project.framework && project.framework !== 'unknown'}
					<span class="framework" style="background: {frameworkColors[project.framework]}">{project.framework}</span>
				{/if}
				{#if project.runner}
					<span class="runner">{project.runner}</span>
				{/if}
			</div>

			<strong>{project.name}</strong>
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
				<button class="readme-toggle" onclick={() => expandedReadme = expandedReadme === project.path ? null : project.path}>
					{expandedReadme === project.path ? 'Hide' : 'Show'} README
				</button>
				{#if expandedReadme === project.path}
					<pre class="readme">{project.readme}</pre>
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
				<button onclick={() => startRename(project)}>Rename</button>
				<button onclick={() => startMove(project)}>Move</button>
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
				{#each data.folders as folder}
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
	main {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}

	header {
		display: flex;
		align-items: baseline;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	h1 { margin: 0; }
	.count { color: #666; font-size: 0.9rem; }

	.search-row {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	input[type="search"] {
		flex: 1;
		padding: 0.75rem;
		font-size: 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	.toggle-filters {
		padding: 0.75rem 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.toggle-filters:hover { background: #f5f5f5; }

	.badge {
		background: #007bff;
		color: white;
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		border-radius: 10px;
	}

	.clear {
		padding: 0.75rem 1rem;
		border: 1px solid #dc3545;
		border-radius: 4px;
		background: white;
		color: #dc3545;
		cursor: pointer;
	}

	.clear:hover { background: #dc3545; color: white; }

	.filters {
		background: #f9f9f9;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1rem;
		display: grid;
		gap: 1rem;
	}

	.filter-group label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		color: #666;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.chip {
		padding: 0.3rem 0.6rem;
		font-size: 0.8rem;
		border: 1px solid #ddd;
		border-radius: 16px;
		background: white;
		cursor: pointer;
		transition: all 0.15s;
	}

	.chip:hover { border-color: #999; }

	.chip.active {
		background: var(--color, #007bff);
		color: white;
		border-color: var(--color, #007bff);
	}

	.projects {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 1rem;
	}

	li {
		padding: 1rem;
		border: 1px solid #eee;
		border-radius: 8px;
		position: relative;
	}

	li:hover { border-color: #ccc; }

	.header {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		display: flex;
		gap: 0.25rem;
	}

	.type, .runner, .framework {
		font-size: 0.65rem;
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		color: white;
		text-transform: uppercase;
	}

	.runner { background: #555; }
	strong { font-size: 1.1rem; }

	.path {
		display: block;
		font-size: 0.75rem;
		color: #888;
		margin: 0.25rem 0;
	}

	.desc {
		margin: 0.5rem 0;
		color: #555;
		font-size: 0.9rem;
		cursor: pointer;
	}

	.desc:hover { color: #333; }

	.edit-desc {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.edit-desc input {
		flex: 1;
		padding: 0.4rem;
		border: 1px solid #ddd;
		border-radius: 4px;
	}

	.readme-toggle {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		background: #f5f5f5;
		border: 1px solid #ddd;
		border-radius: 3px;
		cursor: pointer;
	}

	.readme {
		margin: 0.5rem 0;
		padding: 0.75rem;
		background: #f9f9f9;
		border-radius: 4px;
		font-size: 0.8rem;
		max-height: 300px;
		overflow: auto;
		white-space: pre-wrap;
	}

	.scripts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0.5rem 0;
	}

	.script {
		font-size: 0.7rem;
		padding: 0.1rem 0.4rem;
		background: #f0f0f0;
		border-radius: 3px;
		font-family: monospace;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	button {
		padding: 0.4rem 0.75rem;
		font-size: 0.8rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: white;
		cursor: pointer;
	}

	button:hover { background: #f5f5f5; }

	.running {
		display: inline-block;
		margin-top: 0.5rem;
		font-size: 0.8rem;
		color: #28a745;
	}

	time {
		position: absolute;
		bottom: 0.5rem;
		right: 0.5rem;
		font-size: 0.7rem;
		color: #999;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		background: white;
		padding: 1.5rem;
		border-radius: 8px;
		min-width: 300px;
		max-width: 400px;
	}

	.modal h3 {
		margin: 0 0 1rem;
	}

	.modal input, .modal select {
		width: 100%;
		padding: 0.5rem;
		font-size: 1rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		margin-bottom: 1rem;
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.modal-actions button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.view-toggle {
		display: flex;
		border: 1px solid #ddd;
		border-radius: 4px;
		overflow: hidden;
	}

	.view-toggle button {
		border: none;
		border-radius: 0;
		padding: 0.75rem 1rem;
	}

	.view-toggle button:first-child {
		border-right: 1px solid #ddd;
	}

	.view-toggle button.active {
		background: #007bff;
		color: white;
	}

	.nested-view {
		display: grid;
		gap: 0.5rem;
	}

	.folder {
		margin-left: calc(var(--depth) * 1.5rem);
	}

	.folder-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: #f5f5f5;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		width: 100%;
		text-align: left;
	}

	.folder-toggle:hover {
		background: #eee;
	}

	.folder-icon {
		font-size: 1rem;
	}

	.folder-name {
		font-weight: 600;
		flex: 1;
	}

	.folder-count {
		font-size: 0.75rem;
		color: #666;
		background: #ddd;
		padding: 0.1rem 0.4rem;
		border-radius: 10px;
	}

	.projects.nested {
		margin-left: calc(var(--depth, 0) * 1.5rem + 1.5rem);
		margin-top: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.projects.nested.root-projects {
		margin-left: 0;
	}
</style>
