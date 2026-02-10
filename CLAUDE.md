# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Start dev server (vite)
bun run build            # Build for production
bun run preview          # Preview production build
bun run check            # Type-check with svelte-check
bun run check:watch      # Type-check in watch mode
bun run scan [dir] [out] # CLI scanner (standalone)
```

## Architecture

SvelteKit 2 app (Svelte 5 runes) that scans a development folder and displays projects in a filterable UI.

**Svelte 5 runes in use:** `$state`, `$props`, `$effect` (no stores/writable)

### Core Components

**Scanner (`src/lib/scanner.ts`)**
- Recursively scans directories (max 3 levels) for projects
- Detects project type from manifests: package.json, pyproject.toml, Cargo.toml, go.mod
- Detects package manager from lockfiles: bun.lockb, yarn.lock, pnpm-lock.yaml, package-lock.json, uv.lock
- Detects justfile presence and parses recipes
- Exports `Project` and `ProjectIndex` types used throughout
- Implements stale-while-revalidate caching (`.project-index-cache.json`, 60s TTL)
- Ignores: node_modules, .git, dist, build, .svelte-kit, __pycache__, .venv, .cache, .beads

**Main UI (`src/routes/+page.svelte`)**
- Single-page app with filter chips (type, framework, runner, tools)
- Flat and nested view modes
- Project cards show: git status, scripts, just recipes, dev command
- Actions: run dev server, open iTerm, open Finder, rename, move

**API Endpoints (`src/routes/api/`)**
- `GET /api/projects` - Main data endpoint with caching
- `POST /api/run` - Spawn dev server (supports npm/bun/yarn/pnpm/uv/just)
- `POST /api/git` - Batch git status check
- `POST /api/readme` - Lazy README loading
- `POST /api/refresh` - Force rescan
- `POST /api/iterm`, `/api/finder` - macOS integrations
- `PUT /api/description` - Update project description in manifest
- `POST /api/rename`, `/api/move` - File operations
- `GET/POST/PUT /api/agent-files` - CLAUDE.md and AGENTS.md operations

### Data Flow

1. `+page.server.ts` calls `scan()` on server load
2. Scanner returns cached data immediately, marks as `stale` if >60s old
3. UI triggers background refresh if stale
4. Git status loaded in batches client-side after initial render
5. README content loaded on-demand when expanded

### Key Types

```typescript
type Framework = 'sveltekit' | 'svelte' | 'next' | 'nuxt' | 'astro' | ... | 'unknown';
type GitStatus = 'clean' | 'dirty' | 'no-repo' | 'error';

interface Project {
  name: string;
  path: string;
  type?: 'node' | 'python' | 'rust' | 'go';
  runner?: 'bun' | 'npm' | 'yarn' | 'pnpm' | 'uv';
  framework?: Framework;
  scripts?: Record<string, string>;
  hasJustfile?: boolean;
  justRecipes?: string[];
  // ...
}
```
