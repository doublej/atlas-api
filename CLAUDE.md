# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install              # Install dependencies
bun run dev              # Start dev server (vite) on :47891 — local iteration only, NOT the daemon
bun run build            # Build for production (runs under `bun --bun`, see below)
bun run start            # Serve the build (what the launchd daemon runs)
bun run daemon:reload    # Rebuild + restart the daemon — run this after changing API code
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
- Recursively scans directories for projects. Depth is no longer a constant: `.atlas-config.json`
  at the scan root carries `maxDepth` (default 3), a per-subtree `depth` map — the only way to
  walk *into* a folder that is itself a project, which is what catalogs the apps in a monorepo —
  `force`, which promotes or demotes a folder the detectors read wrong, and `ignore`, glob
  patterns whose folders are skipped whole, subtree included (`src/lib/atlasFile.ts`)
- Detects project type from manifests: package.json, pyproject.toml, Cargo.toml, go.mod
- Detects package manager from lockfiles: bun.lockb, yarn.lock, pnpm-lock.yaml, package-lock.json, uv.lock
- Detects justfile presence and parses recipes
- Exports `Project` and `ProjectAtlas` types used throughout
- Implements stale-while-revalidate caching (`.atlas-cache.json`, 60s TTL)
- Ignores: node_modules, .git, dist, build, .svelte-kit, __pycache__, .venv, .cache, .beads

**Branch flow (`detectGitStatus` in `scanner.ts`)**
- One `git` spawn per repo (`GIT_PROBE`, `---`-separated sections) yields branch, trunk/develop refs, origin url and dirty state — the same spawn budget as before the `flow` field existed
- `Project.flow` derives a `FlowPolicy`: no remote → `local`, origin owner ≠ `ATLAS_GIT_OWNER` (default `doublej`) → `external`, a `develop` branch → `gitflow`, otherwise → `trunk`. Only `gitflow` repos get a `drift` string, so the other ~450 stay silent
- `.atlas` may declare `flow: { policy, trunk, integration }`; the declared block wins over detection. `atlas flow init` writes it

**Domains (`src/lib/domains.ts`)**
- `detectDomains()` collects a project's production domains from its own files: CNAME, `vercel.json` alias, `.vercel/project.json` (`<projectName>.vercel.app`), wrangler routes and `<name>.pages.dev`, `package.json` homepage, `og:url`/canonical in the HTML entry point, robots.txt `Sitemap:` lines, and `SITE_URL`/`ORIGIN`-style env keys
- `normalizeDomain()` reduces any of those to a bare host and drops placeholders (localhost, `*.local`, code hosts like github.com)

**Umami (`src/lib/umami.ts`)**
- One ripgrep pass over the dev root finds files carrying a `data-website-id` snippet; each file's ids are attached to the deepest project containing it, and any `og:url`/canonical in that same file feeds `domains`
- ripgrep is resolved by absolute path as well (`/opt/homebrew/bin/rg`) because launchd runs atlas-api with a minimal PATH; without it, detection is skipped with a warning and the rest of the scan is unaffected
- `.atlas` overrides both fields: `umami` (id string, array, or `{ websiteIds, instance }`) and `domain`/`domains`

**Remote hosts (`src/lib/remoteScan.ts`)**
- `scanHost(host)` ships/runs the bundled scan agent over SSH (`bun run agent:build` →
  `shared/agent/atlas-scan.mjs`) and writes `~/dev/.atlas-cache-<id>.json`.
  It never throws: an unreachable host keeps its previous projects and is reported
  `status: 'unreachable'` in `ProjectAtlas.hosts[]`
- `refreshHosts()` is TTL-guarded (10 min) and de-duplicated per host. **Never awaited by
  `GET /api/projects`** — the catalog answers from the merged cache in ~30ms whether or not
  Ubuntu is powered on. `POST /api/refresh?host=<id>` is the one blocking form
- The merge itself lives in `scanner.ts` (`finalizeAtlas`), not here, so it has no import cycle
  and so the scanner keeps working standalone. It is idempotent: it drops non-local projects
  before re-merging, which is what stops the 60s revalidation from erasing the merged catalog
- `resolveLocal()` (`$lib/config`) is the write boundary — see the root CLAUDE.md

**CLAUDE.md tree (`src/lib/claude-tree.ts`)**
- `buildTree(root, { ancestorsOnly })` walks up to the ancestors and (unless `ancestorsOnly`) down through descendants/glossaries/rules. `?up=1` on `GET /api/claude-tree` sets `ancestorsOnly` — the chain towards the root only, and no recursive walk
- `buildTreeCached()` memoizes that per root+option for 60s (same bargain as the scanner cache). Every route that writes a context file (`POST /api/claude-tree`, `POST`/`PUT /api/agent-files`) calls `clearTreeCache()`; edits made outside atlas show up within the TTL

**Main UI (`src/routes/+page.svelte`)**
- A ~300-line composition root: state, derived values, and callbacks only. All markup and CSS
  live in components; the page has no presentational styling beyond page layout.
- Component tree (directories are capped at 6 files by `.quality.json`):

| Directory | Holds |
|---|---|
| `src/lib/components/ui/` | `Button`, `Chip`, `Badge`, `Menu`, `Modal`, `Card` — the Tooling primitives |
| `src/lib/components/browser/` | `BrowserHeader`, `Toolbar`, `FilterPanel`, `FolderTree`, `HostBanner`, `Notice` |
| `src/lib/components/dialogs/` | `RenameDialog`, `MoveDialog`, `ProjectSettings`, `BeadsDialog` |
| `src/lib/components/project/` | `ProjectRow`, `ProjectBadges`, `ProjectDetails`, `ProjectActions`, `ProjectLinks`, `ClaudeSetup` |
| `src/lib/components/table/` | `ProjectTable` (sortable, full-width, default view) + `ProjectLine` (one 30px line); opening a line renders the full `ProjectRow` below it |
| `src/lib/components/icons/` | `Icon.svelte` + `paths.ts` — a vendored Lucide subset (no icon dependency) |
| `src/lib/browser/` | `filters.ts`, `tree.ts`, `api.ts`, `colors.ts` + their tests — pure logic, no runes |

- Design tokens live in `src/lib/styles/tokens.css` (the Tooling design system) and are the single
  source of colour, type, spacing, density and motion. Both routes read them; there is no second
  token layer. Plain CSS only — no Tailwind.
- Projects render as a dense single-column row list inside one bordered card, not a card grid.
  The card treatment (hairline + accent gradient + up-left halo) belongs on containers, never rows.
- Table (default, full window width), Cards (the row list) and Nested view modes. The social-promo
  facet (promotion-vault status) only shows when some project has a vault entry
- Host badges and an `alsoOn` chip per twin whenever the catalog spans more than one machine, and
  a banner for any host whose last scan came back `unreachable`/`error`
- Project rows render on the client: the SSR HTML of `/` holds only the serialized payload, so `curl /`
  proves a loader change and nothing about the UI. Verify rows in a browser, where 500+ rows take ~10s to
  appear. The scaffold badge (`ProjectBadges.svelte`) compares `project.template.version` with the
  template's current `_version` from `templateVersions` in `+page.server.ts` and turns amber when behind

**System console (`src/routes/system/`)**
- One page for the machine-level view: hosts (status, per-host rescan, registry editor), the
  scanner config, the launchd daemons and the port audit. Sections are sibling components next to
  the page, the way `claude-tree/` does it. A side menu shows one section at a time (`?tab=`),
  and each menu line carries a count of what needs attention (unreachable hosts, failing or
  stale daemons, port collisions)

**Action rendering.** `ProjectActions` renders whatever `getActions(project, 'svelte')` returns:
four ids get an inline button (`run-dev`, `open-iterm`, `open-finder`, `claude-tree-view`) and the
rest fall into the overflow menu, grouped by the registry's own groups. `runAction` in
`src/lib/browser/api.ts` is the executor — `clipboard`, `iterm-command`, `open-url` and `api`
types each have a case; `open-default` is the one action with no browser equivalent, and the
dialog-backed ones (`rename`, `move`, `project-settings`, `beads-create`) are handled by the page.
Scripts, just recipes, domains and umami links come from `getDynamicActions`.
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
- `GET/PATCH /api/atlas` - read/merge a project's `.atlas` (`null` in the patch clears a key)
- `GET/PUT /api/config` - the scanner's `.atlas-config.json` (`maxDepth`, `depth`, `force`, `ignore`)
- `GET/PUT /api/hosts` - the host registry; a write lands in the file but the running daemon
  keeps its start-up copy until `bun run daemon:reload`, which the response says as `restartRequired`
- `POST /api/iterm` also takes an optional `command`, which is what backs every web launcher
- `GET /api/daemons` - List launchd daemons joined with live `launchctl` state, port check, stale-path detection
- `GET/POST /api/services` - service hostname states / sync now. `src/lib/services.ts` runs the sync from `src/hooks.server.ts` (`init`, every 60s, skipped under `vite dev`) and holds the loopback bridges in memory
- `POST /api/daemons/:label` - Lifecycle actions (`{action: 'start'|'stop'|'restart'}`); gated by `ATLAS_DAEMON_WRITE=1`

### Daemon management

Atlas reads the shared registry at `../shared/daemons.json` and shells out to `launchctl` via `src/lib/launchctl.ts` (5s SIGKILL timeout on every call).

Three-layer guard prevents atlas-api from lifecycle-managing itself:
1. Registry flag — `com.jurrejan.atlas-api` is marked `selfManaged: true`.
2. Endpoint guard — `POST /api/daemons/:label` returns 403 `self-managed` for any daemon with that flag.
3. Env gate — all writes return 403 `writes disabled` unless `ATLAS_DAEMON_WRITE=1` is set (configured in the plist's `EnvironmentVariables`).

`atlas-watchdog` remains the sole supervisor for `com.jurrejan.atlas-api`. No auto-restart logic lives in atlas-api itself.

Plists live in their owning repo under a `launchd/` directory and are symlinked from `~/Library/LaunchAgents/`. Edit plists by hand; v1 ships zero plist writes from code.

#### The daemon serves the build, not `vite dev`

The plist runs `bun build/index.js` (adapter-node). This is load-bearing, not a preference:
`vite dev` took ~20s to bind the port and ~50s to compile its first response, because the
first request pulls the whole SSR graph (CodeMirror, xyflow, dagre, the agent SDKs) through
on-demand transform. Every health check timed out against that and restarted the daemon
mid-boot, which invalidated vite's dep cache and made the next boot slower — a loop that
never converged (46 restarts in a day, all `Killed: 9`). The build boots in ~0.3s.

Rules that keep it that way:
- **`GET /api/health`** is the liveness endpoint. Never health-check `/` — that conflates
  "process is serving" with "the UI renders", so a 500 in a Svelte route reads as a dead API.
- **Never `launchctl kickstart -k`** from a poller. `-k` SIGKILLs a job that is alive and
  merely slow. Plain `kickstart` starts a dead job and leaves a live one alone (verified:
  5 consecutive kickstarts left `runs = 1` and the pid unchanged). The plist's `KeepAlive`
  already restarts real crashes in ~2.5s without help. `-k` is fine in `daemon:reload`,
  where the restart is what you asked for.
- **Source edits do not reach the daemon until you rebuild.** Run `bun run daemon:reload`.
  Use `bun run dev` on a *different* port while iterating.

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
