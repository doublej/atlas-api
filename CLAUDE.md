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
| `src/lib/components/browser/` | `BrowserHeader`, `Toolbar`, `FilterPanel`, `FolderTree`, `HostBanner`, `ProjectViews` (the table / Cards / Nested switch and its loading, empty and error states) |
| `src/lib/components/feedback/` | `Notice`, `PageState`, `ConfirmDialog`, `Toaster` — page state, confirms and action toasts (see `docs/ui-primitives.md`) |
| `src/lib/components/dialogs/` | `RenameDialog`, `MoveDialog`, `ProjectSettings`, `BeadsDialog` |
| `src/lib/components/project/` | `ProjectRow`, `ProjectBadges`, `ProjectDetails`, `ProjectActions`, `ProjectLinks`, `ClaudeSetup` |
| `src/lib/components/table/` | `Table` (the shared data table) · `ProjectTable` (the default view, on `Table`); opening a row loads its full record and renders `ProjectRow` below it |
| `src/lib/components/icons/` | `Icon.svelte` + `paths.ts` — a vendored Lucide subset (no icon dependency) |
| `src/lib/browser/` | `filters.ts`, `tree.ts`, `api.ts`, `colors.ts` + their tests — pure logic, no runes |

- **`docs/ui-primitives.md`** is the contract for every page: `$lib/http` (the only client
  fetch), `$lib/format` (`errorMessage`, `tildify`), `$lib/toast.svelte`, `$lib/selection.svelte`
  (one click rule), `Table`, `SideNav`, `ConfirmDialog`, `Notice`, `PageState`.
- Design tokens live in `src/lib/styles/tokens.css` (the Tooling design system) and are the single
  source of colour, type, spacing, density and motion. Both routes read them; there is no second
  token layer. Plain CSS only — no Tailwind.
- Projects render as a dense single-column row list inside one bordered card, not a card grid.
  The card treatment (hairline + accent gradient + up-left halo) belongs on containers, never rows.
- Table (default, full window width), Cards (the row list) and Nested view modes. The social-promo
  facet (promotion-vault status) only shows when some project has a vault entry
- Host badges and an `alsoOn` chip per twin whenever the catalog spans more than one machine, and
  a banner for any host whose last scan came back `unreachable`/`error`
- Project rows render in SSR (`projects` is a writable `$derived` of `data`, never `$state` filled by an
  `$effect`, which rendered "No projects" and then re-rendered 500+ rows on the client) — the first 80
  only (`Table`'s `initialRows`); the rest follow after mount. The page data is a `ProjectSummary` per
  project (`$lib/project-summary`); a row's full record loads when it opens (`GET /api/projects?path=`),
  and Cards/Nested load all of them once (`$lib/project-records.svelte`). The scaffold badge (`ProjectBadges.svelte`) compares `project.template.version` with the
  template's current `_version` from `templateVersions` in `+page.server.ts` and turns amber when behind

**System console (`src/routes/system/`)**
- One page for the machine-level view: hosts (status, per-host rescan, registry editor), the
  scanner config, the launchd daemons and the port audit. Sections are sibling components next to
  the page, the way `claude-tree/` does it. A side menu shows one section at a time (`?tab=`),
  and each menu line carries a count of what needs attention (unreachable hosts, failing or
  stale daemons, port collisions)

**Disk console (`src/routes/disk/`, `src/lib/disk.ts`)**
- The web face of `atlas disk`. It never reimplements an operation: reads run `atlas disk … --json`
  (`diskJson`), changes run as a detached `atlas disk job --log <file> -- …` in its own process
  group, which outlives a daemon restart and writes `<log>.exit`. The page polls `/api/disk/jobs/:id`
  every 500ms (`DiskJobPanel`), cancels with SIGINT to the group, and picks a running job back up
  on reload. The CLI's lock keeps it to one job; its refusal (exit 4) shows in the panel
- Every argument goes through `checkArgs` (a per-command allowlist; `--unattended`/`--include-dirty`
  are not on it) and `isRead` decides read vs job. Jobs always get `--confirmed`, because the page
  showed the plan first. Who may write is the request guard's call, not the disk routes' (below)
- `ATLAS_BIN` (default `~/.bun/bin/atlas`) and `ATLAS_DISK_HOME` pass through; test against a scratch
  state with `ATLAS_DISK_HOME`, `ATLAS_DISK_SCAN_ROOT`, `ATLAS_DISK_LAUNCHCTL`, `ATLAS_DISK_PLIST_DIR`
  and `ATLAS_DISK_LAUNCH_AGENTS` set on a `vite dev --port 47990`, never on the daemon

**Action rendering.** `ProjectActions` renders whatever `getActions(project, 'svelte')` returns:
four ids get an inline button (`run-dev`, `open-iterm`, `open-finder`, `claude-tree-view`) and the
rest fall into the overflow menu, grouped by the registry's own groups. `runAction` in
`src/lib/browser/api.ts` is the executor — `clipboard`, `iterm-command`, `open-url` and `api`
types each have a case; `open-default` is the one action with no browser equivalent, and the
dialog-backed ones (`rename`, `move`, `project-settings`, `beads-create`) are handled by the page.
Scripts, just recipes, domains and umami links come from `getDynamicActions`.
- Project cards show: git status, scripts, just recipes, dev command
- Actions: run dev server, open iTerm, open Finder, rename, move

**Request guard (`src/lib/guard.ts`, `handle` in `src/hooks.server.ts`)**
- One check for every route, no login. Every non-GET/HEAD passes only from this Mac (no
  `x-forwarded-for`, a loopback `Host` against DNS rebinding, nothing from another origin against
  CSRF — `Origin` must be `http://<Host>` itself, and a browser's `Sec-Fetch-Site` `same-origin`
  or `none`, so a page on another localhost port or a cross-site `<img>` is refused) or through
  the NAS Caddy on `atlas.jurrejan.com`/`atlas.atlas.local` with that hostname's own `Origin`.
  `atlas.atlas.remote` (off-LAN, password-gated) is read-only; any other forwarded host gets
  nothing, reads included
- `LOCAL_ONLY` route ids answer only this Mac and the LAN, for *every* method: file contents (`env-files`,
  `agent-files`, `claude-tree` — its `?path=` reads any file under ~/dev), `ports/listeners` (full
  argv, tokens included), `ports/allocate` (reserves a port) and the screen actions `iterm`/`finder`.
  So does `GET /api/projects?dir=` (Raycast's `scanDirs`): it walks any folder and writes
  `.atlas-cache.json` into it. Refusals are 403 `{ error }`. A load's own
  `fetch` (`isSubRequest`) is not re-checked — its page already was

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
- `GET /api/ports/listeners` - every TCP listener on this Mac joined with its owner (project by cwd, service by port, docker container), 10s cache, `?fresh=1` skips it. Backs the `/ports` page, which replaced the Active Ports Raycast web dashboard
  Listeners come from `netstat -anv` (`listSockets` in `$lib/ports`), never `lsof -iTCP`: lsof walks every process and hangs in uninterruptible wait, past any timeout, when a NAS SMB mount stalls. That made the page read "0 listening"
- `POST /api/ports/kill` - `{ pids }` → SIGKILL, only for pids the listener scan saw, never atlas-api's own
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
3. A stale load is revalidated on the server (one scan at a time); the page reloads 15s later and never forces `POST /api/refresh` itself
4. Git status comes from the cache (`git`/`gitBranch`, refreshed with it); `/api/git` probes only local projects the cache has none for — probing all ~500 per load held every browser connection for ~40s
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
   pre-existing modules** (`scanner.ts`, `claude-tree.ts` and the `claude-tree-entities.ts`,
   `claude-tree-parse.ts` and `claude-tree-walk.ts` modules its code moved into verbatim,
   `templates.ts`, `umami.ts`, `domains.ts`, `ports.ts`, the API routes, and
   `src/routes/claude-tree/**`). Satisfying them means refactoring that logic, which is out of
   scope for UI work. New code is held to the full ruleset.
3. **`.quality.json` gives the two size gates separate glob lists.** `loc.globs` covers every
   `src/**/*.svelte` and every `src/lib/**/*.ts`, tests included (warn 300, error 400).
   `loc.exempt` lists files the recipe skips and prints as `exempt debt` instead of failing on:
   only `src/lib/scanner.ts` (1,456 lines). `dir.globs` (6-file cap) still covers only
   `src/lib/components/**`, `src/lib/browser/**` and `src/routes/+*.svelte`; `src/lib` itself
   holds over 50 modules.

**Follow-up to close the gate:** split `scanner.ts` and drop it from `loc.exempt`. In the same
change, import `estimateTokens` from `./claude-tree-parse` and delete the re-export in
`claude-tree.ts` that exists only for `scanner.ts`.
