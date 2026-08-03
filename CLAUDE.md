# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Start dev server (vite) on :47891
bun run build            # Build for production (runs under `bun --bun`, see below)
bun run preview          # Preview production build
bun run check            # Type-check with svelte-check
bun run check:watch      # Type-check in watch mode
bun run test             # Vitest (unit tests for the pure browser modules)
bun run lint             # biome check + stylelint
bun run lint:fix         # biome check --write + stylelint --fix
bun run scan [dir] [out] # CLI scanner (standalone)

just check               # Full gate: fmt → loc → dir → lint → typecheck → test
```

`build` is `bun --bun vite build`, not plain `vite build`: `src/routes/api/agent-log/+server.ts`
imports `bun:sqlite`, and SvelteKit evaluates server modules during the build. Under Node that
import fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME`, so the build has to run on the Bun runtime.

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

**Domains (`src/lib/domains.ts`)**
- `detectDomains()` collects a project's production domains from its own files: CNAME, `vercel.json` alias, `.vercel/project.json` (`<projectName>.vercel.app`), wrangler routes and `<name>.pages.dev`, `package.json` homepage, `og:url`/canonical in the HTML entry point, robots.txt `Sitemap:` lines, and `SITE_URL`/`ORIGIN`-style env keys
- `normalizeDomain()` reduces any of those to a bare host and drops placeholders (localhost, `*.local`, code hosts like github.com)

**Umami (`src/lib/umami.ts`)**
- One ripgrep pass over the dev root finds files carrying a `data-website-id` snippet; each file's ids are attached to the deepest project containing it, and any `og:url`/canonical in that same file feeds `domains`
- ripgrep is resolved by absolute path as well (`/opt/homebrew/bin/rg`) because launchd runs atlas-api with a minimal PATH; without it, detection is skipped with a warning and the rest of the scan is unaffected
- `.atlas` overrides both fields: `umami` (id string, array, or `{ websiteIds, instance }`) and `domain`/`domains`

**Main UI (`src/routes/+page.svelte`)**
- A ~300-line composition root: state, derived values, and callbacks only. All markup and CSS
  live in components; the page has no presentational styling beyond page layout.
- Component tree (directories are capped at 6 files by `.quality.json`):

| Directory | Holds |
|---|---|
| `src/lib/components/ui/` | `Button`, `Chip`, `Badge`, `Menu`, `Modal`, `Card` — the Tooling primitives |
| `src/lib/components/browser/` | `BrowserHeader`, `Toolbar`, `FilterPanel`, `FolderTree`, `RenameDialog`, `MoveDialog` |
| `src/lib/components/project/` | `ProjectRow`, `ProjectBadges`, `ProjectDetails`, `ProjectActions`, `ProjectLinks` |
| `src/lib/components/icons/` | `Icon.svelte` + `paths.ts` — a vendored Lucide subset (no icon dependency) |
| `src/lib/browser/` | `filters.ts`, `tree.ts`, `api.ts`, `colors.ts` + their tests — pure logic, no runes |

- Design tokens live in `src/lib/styles/tokens.css` (the Tooling design system) and are the single
  source of colour, type, spacing, density and motion. Both routes read them; there is no second
  token layer. Plain CSS only — no Tailwind.
- Projects render as a dense single-column row list inside one bordered card, not a card grid.
  The card treatment (hairline + accent gradient + up-left halo) belongs on containers, never rows.
- Flat and nested view modes

**Action rendering.** `ProjectActions` takes labels, icons and conditions from `shared/actions.json`
but renders an explicit allowlist (`run-dev`, `open-iterm`, `open-finder`, `claude-tree-view`,
`rename`, `move`). Most registry actions carry no `consumers` field, so `getActions` returns far
more than this consumer implements — the `clipboard` and `iterm-command` types have no executor in
the browser. Scripts, just recipes, domains and umami links come from `getDynamicActions`.
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
  domains?: string[];                 // production domains detected from project files
  umami?: { websiteIds: string[]; instance?: string };
  // ...
}
```

## Tooling debt (deliberate, scoped)

The repo follows the `typescript/sveltekit` cookiecutter template (v2.4.2: Biome, stylelint,
Vite 8, Vitest, Justfile). Three deviations are intentional and should not be "fixed" casually:

1. **`biome.json` disables `noUnusedVariables` / `noUnusedImports` for `**/*.svelte`.** Biome parses
   only the `<script>` block, so anything used solely in markup reads as unused — it flagged 104
   false positives here, each with an *unsafe autofix that deletes working code*. `svelte-check`
   covers these correctly. Do not remove this override.
2. **`biome.json` disables `noExcessiveCognitiveComplexity` and a few mechanical rules for
   pre-existing modules** (`scanner.ts`, `claude-tree.ts`, `umami.ts`, `domains.ts`, the API routes,
   and `src/routes/claude-tree/**`). Satisfying them means refactoring the scanner, which is out of
   scope for UI work. New code is held to the full ruleset.
3. **`.quality.json` globs cover only the code the UI overhaul owns** (`src/lib/components/**`,
   `src/lib/browser/**`, `src/routes/+*.svelte`). The template's `src/**` would error immediately on
   `scanner.ts` (818 lines), `claude-tree.ts` (621) and `claude-tree/+page.svelte` (1,551), and
   `src/lib` holds 17 files against a 6-file cap. `loc-check`/`dir-check` have no exclude mechanism,
   only globs.

**Follow-up to widen the gate:** split `scanner.ts` and `claude-tree.ts`, decompose
`src/routes/claude-tree/+page.svelte`, then broaden the `.quality.json` globs and drop the matching
Biome overrides.
