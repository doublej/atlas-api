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
- Exports `Project` and `ProjectAtlas` types used throughout
- Implements stale-while-revalidate caching (`.atlas-cache.json`, 60s TTL)
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
- `GET /api/daemons` - List launchd daemons joined with live `launchctl` state, port check, stale-path detection
- `POST /api/daemons/:label` - Lifecycle actions (`{action: 'start'|'stop'|'restart'}`); gated by `ATLAS_DAEMON_WRITE=1`

### Daemon management

Atlas reads the shared registry at `../shared/daemons.json` and shells out to `launchctl` via `src/lib/launchctl.ts` (5s SIGKILL timeout on every call).

Three-layer guard prevents atlas-api from lifecycle-managing itself:
1. Registry flag — `com.jurrejan.atlas-api` is marked `selfManaged: true`.
2. Endpoint guard — `POST /api/daemons/:label` returns 403 `self-managed` for any daemon with that flag.
3. Env gate — all writes return 403 `writes disabled` unless `ATLAS_DAEMON_WRITE=1` is set (configured in the plist's `EnvironmentVariables`).

`atlas-watchdog` remains the sole supervisor for `com.jurrejan.atlas-api`. No auto-restart logic lives in atlas-api itself.

Plists live in their owning repo under a `launchd/` directory and are symlinked from `~/Library/LaunchAgents/`. Edit plists by hand; v1 ships zero plist writes from code.

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
