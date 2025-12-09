import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const IGNORE = new Set(['.DS_Store', '.git', 'node_modules', '.TemporaryItems', 'dist', 'build', '.svelte-kit', '__pycache__', '.venv', 'venv', '.cache', '.beads']);
const MAX_DEPTH = 3;

export type Framework =
	| 'sveltekit' | 'svelte' | 'next' | 'nuxt' | 'astro' | 'remix' | 'vite' | 'react' | 'vue' | 'angular'
	| 'express' | 'fastify' | 'hono' | 'elysia'
	| 'fastapi' | 'flask' | 'django' | 'streamlit'
	| 'tauri' | 'electron'
	| 'unknown';

export type GitStatus = 'clean' | 'dirty' | 'no-repo' | 'error';

export interface Project {
	name: string;
	path: string;
	relativePath: string;
	description?: string;
	readme?: string;
	type?: string;
	framework?: Framework;
	modifiedAt: string;
	scripts?: Record<string, string>;
	devCommand?: string;
	runner?: 'bun' | 'npm' | 'yarn' | 'pnpm' | 'uv';
	git?: GitStatus;
	gitBranch?: string;
}

export interface ProjectIndex {
	baseDir: string;
	scannedAt: string;
	projects: Project[];
	frameworks: Framework[];
	folders: string[];
}

async function detectRunner(fullPath: string): Promise<Project['runner'] | undefined> {
	const checks: [string, Project['runner']][] = [
		['bun.lockb', 'bun'],
		['yarn.lock', 'yarn'],
		['pnpm-lock.yaml', 'pnpm'],
		['package-lock.json', 'npm'],
		['uv.lock', 'uv']
	];

	for (const [file, runner] of checks) {
		try {
			await stat(join(fullPath, file));
			return runner;
		} catch { /* not found */ }
	}
	return undefined;
}

async function detectGitStatus(fullPath: string): Promise<{ status: GitStatus; branch?: string }> {
	try {
		await stat(join(fullPath, '.git'));
	} catch {
		return { status: 'no-repo' };
	}

	try {
		const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: fullPath });
		const branch = branchOut.trim();

		const { stdout: statusOut } = await execAsync('git status --porcelain', { cwd: fullPath });
		const status: GitStatus = statusOut.trim() === '' ? 'clean' : 'dirty';

		return { status, branch };
	} catch {
		return { status: 'error' };
	}
}

function detectFrameworkFromPkg(pkg: Record<string, unknown>): Framework {
	const deps = { ...pkg.dependencies as Record<string, string>, ...pkg.devDependencies as Record<string, string> };

	if (deps['@sveltejs/kit']) return 'sveltekit';
	if (deps['svelte']) return 'svelte';
	if (deps['next']) return 'next';
	if (deps['nuxt']) return 'nuxt';
	if (deps['astro']) return 'astro';
	if (deps['@remix-run/node'] || deps['remix']) return 'remix';
	if (deps['@tauri-apps/api']) return 'tauri';
	if (deps['electron']) return 'electron';
	if (deps['hono']) return 'hono';
	if (deps['elysia']) return 'elysia';
	if (deps['fastify']) return 'fastify';
	if (deps['express']) return 'express';
	if (deps['react']) return 'react';
	if (deps['vue']) return 'vue';
	if (deps['@angular/core']) return 'angular';
	if (deps['vite']) return 'vite';

	return 'unknown';
}

async function detectPythonFramework(fullPath: string): Promise<Framework> {
	try {
		const pyproject = await readFile(join(fullPath, 'pyproject.toml'), 'utf-8');
		if (pyproject.includes('fastapi')) return 'fastapi';
		if (pyproject.includes('flask')) return 'flask';
		if (pyproject.includes('django')) return 'django';
		if (pyproject.includes('streamlit')) return 'streamlit';
	} catch { /* */ }

	try {
		const reqs = await readFile(join(fullPath, 'requirements.txt'), 'utf-8');
		if (reqs.includes('fastapi')) return 'fastapi';
		if (reqs.includes('flask')) return 'flask';
		if (reqs.includes('django')) return 'django';
		if (reqs.includes('streamlit')) return 'streamlit';
	} catch { /* */ }

	return 'unknown';
}

async function getProjectInfo(fullPath: string, skipGit: boolean = false): Promise<Partial<Project>> {
	const info: Partial<Project> = {};

	// Node.js project
	try {
		const pkg = JSON.parse(await readFile(join(fullPath, 'package.json'), 'utf-8'));
		info.description = pkg.description;
		info.type = 'node';
		info.scripts = pkg.scripts;
		info.framework = detectFrameworkFromPkg(pkg);

		if (pkg.scripts?.dev) info.devCommand = 'dev';
		else if (pkg.scripts?.start) info.devCommand = 'start';
		else if (pkg.scripts?.serve) info.devCommand = 'serve';
	} catch { /* no package.json */ }

	// Python project
	if (!info.type) {
		try {
			const pyproject = await readFile(join(fullPath, 'pyproject.toml'), 'utf-8');
			const descMatch = pyproject.match(/description\s*=\s*"([^"]+)"/);
			if (descMatch) info.description = descMatch[1];
			info.type = 'python';
			info.framework = await detectPythonFramework(fullPath);
		} catch { /* no pyproject.toml */ }
	}

	// Cargo (Rust)
	if (!info.type) {
		try {
			const cargo = await readFile(join(fullPath, 'Cargo.toml'), 'utf-8');
			const descMatch = cargo.match(/description\s*=\s*"([^"]+)"/);
			if (descMatch) info.description = descMatch[1];
			info.type = 'rust';
			info.framework = cargo.includes('tauri') ? 'tauri' : 'unknown';
		} catch { /* no Cargo.toml */ }
	}

	// Go module
	if (!info.type) {
		try {
			await stat(join(fullPath, 'go.mod'));
			info.type = 'go';
			info.framework = 'unknown';
		} catch { /* no go.mod */ }
	}

	// README - only check existence, load content lazily
	try {
		await stat(join(fullPath, 'README.md'));
		info.readme = '__HAS_README__'; // marker for lazy loading
		if (!info.description) {
			// Read only first 500 bytes for description extraction
			const fd = await readFile(join(fullPath, 'README.md'), 'utf-8');
			const firstLine = fd.slice(0, 500).split('\n').find(l => l && !l.startsWith('#'))?.trim();
			if (firstLine) info.description = firstLine.slice(0, 150);
		}
	} catch { /* no readme */ }

	info.runner = await detectRunner(fullPath);

	if (!skipGit) {
		const gitInfo = await detectGitStatus(fullPath);
		info.git = gitInfo.status;
		info.gitBranch = gitInfo.branch;
	}

	return info;
}

async function scanFolder(baseDir: string, dir: string, depth: number = 0, skipGit: boolean = false, folders: string[] = []): Promise<Project[]> {
	if (depth > MAX_DEPTH) return [];

	let entries: string[];

	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}

	const validEntries: { entry: string; fullPath: string; stats: Awaited<ReturnType<typeof stat>> }[] = [];

	// Parallel stat check
	const statResults = await Promise.all(
		entries
			.filter(entry => !entry.startsWith('.') && !IGNORE.has(entry))
			.map(async entry => {
				const fullPath = join(dir, entry);
				try {
					const stats = await stat(fullPath);
					return stats.isDirectory() ? { entry, fullPath, stats } : null;
				} catch {
					return null;
				}
			})
	);

	for (const result of statResults) {
		if (result) validEntries.push(result);
	}

	// Parallel project info gathering
	const projectResults = await Promise.all(
		validEntries.map(async ({ entry, fullPath, stats }) => {
			const info = await getProjectInfo(fullPath, skipGit);

			if (info.type) {
				return [{
					name: entry,
					path: fullPath,
					relativePath: relative(baseDir, fullPath),
					modifiedAt: stats.mtime.toISOString(),
					...info
				} as Project];
			} else {
				// Collect non-project folders for move targets (during same traversal)
				if (depth < 2) {
					folders.push(relative(baseDir, fullPath) || entry);
				}
				return scanFolder(baseDir, fullPath, depth + 1, skipGit, folders);
			}
		})
	);

	return projectResults.flat();
}

async function collectFolders(baseDir: string, dir: string, depth: number = 0): Promise<string[]> {
	if (depth > 2) return [];

	const folders: string[] = [];
	let entries: string[];

	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}

	for (const entry of entries) {
		if (entry.startsWith('.') || IGNORE.has(entry)) continue;

		const fullPath = join(dir, entry);
		let stats;

		try {
			stats = await stat(fullPath);
		} catch {
			continue;
		}

		if (!stats.isDirectory()) continue;

		// Check if it's a project folder
		const hasProject = await getProjectInfo(fullPath);
		if (!hasProject.type) {
			folders.push(relative(baseDir, fullPath) || entry);
			const subFolders = await collectFolders(baseDir, fullPath, depth + 1);
			folders.push(...subFolders);
		}
	}

	return folders;
}

const CACHE_FILE = '.project-index-cache.json';
const CACHE_TTL = 30 * 1000; // 30 seconds for stale-while-revalidate
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes max before forced refresh

interface CachedIndex extends ProjectIndex {
	cachedAt: number;
}

export interface ScanResult extends ProjectIndex {
	fromCache: boolean;
	stale: boolean;
}

async function performScan(baseDir: string, skipGit: boolean): Promise<ProjectIndex> {
	const folders: string[] = [];
	const projects = await scanFolder(baseDir, baseDir, 0, skipGit, folders);
	projects.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

	const frameworks = [...new Set(projects.map(p => p.framework).filter(Boolean))] as Framework[];

	return {
		baseDir,
		scannedAt: new Date().toISOString(),
		projects,
		frameworks,
		folders
	};
}

export async function scan(baseDir: string, options: { skipGit?: boolean; useCache?: boolean; forceRefresh?: boolean } = {}): Promise<ScanResult> {
	const { skipGit = false, useCache = true, forceRefresh = false } = options;
	const cachePath = join(baseDir, CACHE_FILE);

	// Try cache first (stale-while-revalidate pattern)
	if (useCache && !forceRefresh) {
		try {
			const cached: CachedIndex = JSON.parse(await readFile(cachePath, 'utf-8'));
			const age = Date.now() - cached.cachedAt;

			if (age < CACHE_MAX_AGE) {
				return { ...cached, fromCache: true, stale: age > CACHE_TTL };
			}
		} catch { /* no cache or invalid */ }
	}

	const result = await performScan(baseDir, skipGit);

	// Save to cache (fire and forget)
	const cacheData: CachedIndex = { ...result, cachedAt: Date.now() };
	writeFile(cachePath, JSON.stringify(cacheData)).catch(() => {});

	return { ...result, fromCache: false, stale: false };
}

export async function getGitStatus(projectPath: string): Promise<{ status: GitStatus; branch?: string }> {
	return detectGitStatus(projectPath);
}

export async function getReadme(projectPath: string): Promise<string | null> {
	try {
		return await readFile(join(projectPath, 'README.md'), 'utf-8');
	} catch {
		return null;
	}
}

export async function updateDescription(projectPath: string, description: string): Promise<void> {
	// Try package.json
	const pkgPath = join(projectPath, 'package.json');
	try {
		const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
		pkg.description = description;
		await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
		return;
	} catch { /* no package.json */ }

	// Try pyproject.toml
	const pyPath = join(projectPath, 'pyproject.toml');
	try {
		let content = await readFile(pyPath, 'utf-8');
		if (content.includes('description')) {
			content = content.replace(/description\s*=\s*"[^"]*"/, `description = "${description}"`);
		} else {
			content = content.replace(/\[project\]/, `[project]\ndescription = "${description}"`);
		}
		await writeFile(pyPath, content);
		return;
	} catch { /* no pyproject.toml */ }

	// Try Cargo.toml
	const cargoPath = join(projectPath, 'Cargo.toml');
	try {
		let content = await readFile(cargoPath, 'utf-8');
		if (content.includes('description')) {
			content = content.replace(/description\s*=\s*"[^"]*"/, `description = "${description}"`);
		} else {
			content = content.replace(/\[package\]/, `[package]\ndescription = "${description}"`);
		}
		await writeFile(cargoPath, content);
		return;
	} catch { /* no Cargo.toml */ }
}

export async function scanAndSave(baseDir: string, outputPath: string): Promise<ProjectIndex> {
	const index = await scan(baseDir);
	await writeFile(outputPath, JSON.stringify(index, null, 2));
	return index;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
	const baseDir = process.argv[2] || process.cwd();
	const output = process.argv[3] || join(baseDir, 'projects.json');

	console.log(`Scanning: ${baseDir}`);
	const index = await scanAndSave(baseDir, output);
	console.log(`Found ${index.projects.length} projects`);
	console.log(`Frameworks: ${index.frameworks.join(', ')}`);
	console.log(`Saved to: ${output}`);
}
