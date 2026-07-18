# Briefing — Centralized CLAUDE.md tree viewer in atlas-api

> **For:** the project-atlas agent.
> **Author:** Claude (from the cookiecutter-templates session).
> **Date:** 2026-05-25.
> **Goal:** move the per-project "CLAUDE.md tree viewer/editor" out of the cookiecutter
> templates and into atlas-api as **one always-on viewer**, then replace the heavy
> per-project script with a thin launcher in the templates.

---

## 1. TL;DR

Today every generated project ships a ~900-line, self-contained `claude_tree.py`
(an ephemeral local web server + editor) in `.claude/scripts/`, synced byte-identical
across **15** cookiecutter templates. Every tweak means editing the file 15×, bumping
15 versions, updating 15 CHANGELOGs, re-running sync_check. That is the wrong unit of
reuse.

**Plan:** build the viewer once as a SvelteKit route in `atlas-api`
(`/claude-tree`) backed by `api/claude-tree` endpoints, reusing `scanner.ts`
(project catalog) and the `api/agent-files` file-IO pattern. Templates then ship only
a `just claude-tree` recipe that deep-links into atlas. See §6 for the exact template
edits.

## 2. Decisions (defaults — adjust if you disagree)

| # | Decision | Default | Why |
|---|----------|---------|-----|
| 1 | Editing | **Keep full edit / save / history** in atlas | atlas already writes files (`api/agent-files` POST, `api/description`, `api/rename`) — consistent. Editing is the useful part. |
| 2 | Graph lib | **Svelte Flow** (`@xyflow/svelte`) + dagre layout | Proper pan/zoom, real components; there's a `svelteflow` skill. Fallback: render mermaid as a component (less work, closer to current). |
| 3 | Launcher | **Ship a thin `just claude-tree` recipe** in templates (deep-link by cwd) + keep atlas's own project picker | Per-project ergonomics + catalog browsing both. |

**Security:** the editor writes arbitrary CLAUDE.md files by path. Validate every
`root`/`path` is inside the atlas catalog `baseDir` (the scanner's scan root) before
read/write. Reject paths that escape it. (Single exception worth allowing: the global
`~/.claude/CLAUDE.md` ancestor — read-only is safest there.)

## 3. What already exists in atlas-api (reuse, don't rebuild)

- **`src/lib/scanner.ts`** — `interface Project { path: string; name; relativePath; framework; hasJustfile; justRecipes; ... }` and `ProjectAtlas { baseDir, projects[] }`. This is your project catalog and the source of each project's absolute `path` (= the tree `root`).
- **`src/routes/api/agent-files/+server.ts`** — already maps `claude → CLAUDE.md`, with `GET ?path=&file=claude` (read) and `POST` (write + optional `open` in editor). The new `api/claude-tree` is a sibling that extends single-file handling to the **whole tree** + preview + history. Mirror its imports: `import { json } from '@sveltejs/kit'`, `readFile/writeFile/stat from 'node:fs/promises'`.
- **Frontend is a single `src/routes/+page.svelte` (~37 KB)** — don't cram the viewer in there. Add a dedicated route `src/routes/claude-tree/+page.svelte` (the "continuous viewer"). Optionally link to it from the project rows in `+page.svelte` (a "tree" button passing `?root=<project.path>`).
- atlas-api is SvelteKit on **port 47891** and is meant to run continuously (see `atlas-watchdog` / `src/lib/launchctl.ts`). Confirm how it's kept alive (launchd) so the launcher's URL is reliably up.

## 4. Build plan — atlas side

### 4a. `src/lib/claude-tree.ts` — port the pure logic

Port these from the reference Python (§5). All filesystem, no framework:

```ts
import { readFile, readdir, stat, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname, basename, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const SKIP = new Set(['.git','node_modules','.venv','venv','target','dist','build',
  '.next','.svelte-kit','.cache','__pycache__','.mypy_cache','.ruff_cache',
  '.pytest_cache','.gradle','DerivedData','.build','.swiftpm']);
const HISTORY_SUFFIX = '.history.jsonl';
const MAX_BYTES = 1_000_000;

export type NodeKind = 'ancestor' | 'project' | 'descendant';
export interface TreeNode { id: string; path: string; label: string; kind: NodeKind;
  parent: string | null; preview: Preview; }
export interface Preview { h1: string; blurb: string; sections: string[]; lines: number; }

export const sha = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 12);

// Walk up from root collecting every CLAUDE.md, then ~/.claude/CLAUDE.md (global).
export async function findAncestors(root: string): Promise<string[]> { /* …port find_ancestors… */ }

// rglob CLAUDE.md under root, skipping SKIP dirs.
export async function findDescendants(root: string): Promise<string[]> { /* …port find_descendants… */ }

// H1 + first prose line + level-2 section headings + line count.
export function extractPreview(text: string): Preview { /* …port extract_preview… */ }

export function shortLabel(p: string): string {
  const h = homedir();
  return p.startsWith(h) ? '~' + p.slice(h.length) : p;
}

// Build {nodes, edges} with parent wiring (ancestor chain → project → descendants by dir nesting).
export async function buildTree(root: string): Promise<TreeNode[]> { /* …port build_mermaid wiring… */ }

// History sidecar: CLAUDE.md.history.jsonl, one {ts, sha, content} per line.
export async function appendHistory(file: string, priorContent: string): Promise<void> { /* … */ }
export async function readHistory(file: string): Promise<{ts:string;sha:string;content:string}[]> { /* … */ }
export async function popHistory(file: string): Promise<{content:string;sha:string} | null> { /* … */ }
```

### 4b. `src/routes/api/claude-tree/+server.ts` — endpoints

Contracts (keep them flat & JSON, mirror `agent-files`):

| Method | Query / body | Returns | Notes |
|--------|--------------|---------|-------|
| `GET ?root=<abs>` | — | `TreeNode[]` (id, path, label, kind, parent, preview) | the graph data |
| `GET ?path=<abs>` | — | `{ content, sha }` | one file's body (cap at `MAX_BYTES`) |
| `POST` `{op:'save', path, content, expectedSha?}` | — | `{ ok, sha }` or `409 {disk_sha}` | append prior to history, then write; optimistic-concurrency on `expectedSha` |
| `POST` `{op:'revert', path}` | — | `{ ok, sha }` | pop last history entry, write it back |
| `GET ?history=<abs>` | — | `{ts,sha,preview}[]` | snapshot list for the dropdown |

**Every handler must `assertInCatalog(path)`** (resolve real path; ensure it is under
the scanner `baseDir`, or is exactly `~/.claude/CLAUDE.md` for read-only). Return 403
otherwise.

### 4c. `src/routes/claude-tree/+page.svelte` — the UI

Two-pane: graph left (resizable), single lazy editor right. **Port the design and the
hard-won fixes from the Python version** (these were the bugs that cost the most time):

- **Render the graph at natural 1:1 size and let the pane scroll** — do NOT fit-to-width. Mermaid/auto-layout shrinks a wide tree until nodes are ~33px and illegible. With Svelte Flow, just don't `fitView` to shrink; default zoom = 1 and pan. With a mermaid component, set the svg to its viewBox size and scroll the container.
- **Node cards are fixed-width (~198px).** A variable/min-content width collapses nodes to ~1ch. Card content: `path` (mono, muted) · **title** (H1) · *blurb* (first prose line, clamp 3 lines) · `§ section · section` (level-2 headings, clamp 2 lines) · `N lines`.
- **Lazy single editor**: clicking a node loads that file into the one editor (not all open). Auto-select the project node on load; highlight the selected node.
- **Dirty-switch guard** (confirm before switching away with unsaved edits), **Cmd/Ctrl-S to save**, save snapshots prior content to the history sidecar, revert pops it, a history dropdown + "preview snapshot".
- **Type/theme** (carried from the redesign): Space Grotesk (UI/titles) + IBM Plex Mono (paths/code/editor), warm-neutral palette, single indigo accent (`#4338ca`), pill badges. atlas can use its own design system instead — match whatever atlas already uses.

Graph data → Svelte Flow: each `TreeNode` becomes a node; draw an edge `parent → id`.
Use **dagre** (or elkjs) for top-down hierarchical layout (see the `svelteflow` skill,
which covers dagre/elkjs + `$state.raw`). Custom node component renders the card.

## 5. Reference implementation (battle-tested, read this)

The current working Python (two-pane, natural-size graph fix, cards, history) lives at:

```
~/Documents/development/_management/cookiecutter-templates/python/fastapi/{{cookiecutter.project_slug}}/.claude/scripts/claude_tree.py
```

(identical copies also installed at
`~/Documents/development/python/finances/.claude/scripts/claude_tree.py` and
`~/Documents/development/multi-stack/pimpelmees/wallgen/.claude/scripts/claude_tree.py`).

Port these functions specifically — they encode the algorithm and the edge cases:

- `find_ancestors` / `find_descendants` — the tree walk (+ `~/.claude/CLAUDE.md`, SKIP dirs).
- `extract_preview` — H1, first prose line (skip headings/quote/list/code/`<`), level-2 sections, line count.
- `build_mermaid` parent-wiring loop — how descendants attach to the nearest ancestor dir.
- `append_history` / `read_history` / `pop_history` — the `.history.jsonl` sidecar model.
- The `sizeGraph()` JS (natural-size fix) and `make_node_html` (card markup) — for the UI.

Mermaid quirk documented there (skip if using Svelte Flow): literal `"` in a label
must stay as mermaid's `#quot;` entity, embedded via plain HTML-escape, or it
terminates the `["…"]` delimiter.

## 6. Template-side changes (cookiecutter-templates) — the "new global command"

Repo: `~/Documents/development/_management/cookiecutter-templates`. This is a **major**
bump (a shipped file + recipe behavior is removed). Apply to **all 15** templates:
`android/quest-vr`, `python/{cli,fastapi,flask}`, `rust/cli`, `swift/{ios,macos}`,
`typescript/{bun-package,nextjs,node-api,node-cli,node-lib,node-worker,react,sveltekit}`.

### 6a. Replace the `claude-tree` recipe body in every `{{cookiecutter.project_slug}}/Justfile`

Find `claude-tree:` in each (it currently runs `python3 .claude/scripts/claude_tree.py`).
Replace the body with the launcher (keep the recipe name = the "new global command"):

```just
# Open this project's CLAUDE.md tree in the project-atlas viewer (atlas-api on :47891)
claude-tree:
    #!/usr/bin/env bash
    set -euo pipefail
    url="http://localhost:47891/claude-tree?root=$(pwd)"
    if curl -fsS -o /dev/null --max-time 1 "http://localhost:47891/" 2>/dev/null; then
        command -v open >/dev/null 2>&1 && open "$url" || echo "Open: $url"
    else
        echo "project-atlas isn't running (atlas-api on :47891). Start it, then open:"
        echo "  $url"
    fi
```

Keep it byte-identical across all Justfiles in a family (sync_check enforces this).
The recipe stays in each family's recipe list in `sync_manifest.json` — only its body
changes, so the per-family justfile recipe comparison still passes.

### 6b. Delete the script from every template

```
rm "<template>/{{cookiecutter.project_slug}}/.claude/scripts/claude_tree.py"   # ×15
```

### 6c. Edit `tools/sync_manifest.json`

Remove the cross-family identical-scripts entry:
`"{{cookiecutter.project_slug}}/.claude/scripts/claude_tree.py"`.

### 6d. Edit `tools/render_test.py`

The `.claude payload` check py_compiles the scripts:
```python
for name in ("check_template_update.py", "claude_tree.py"):
```
→ drop `"claude_tree.py"`.

### 6e. Edit `CLAUDE.md` (repo root)

- The cross-family scripts paragraph names `claude_tree.py` ("renders `.claude/claude-tree.html` … user-invoked via `just claude-tree`") — update to describe the new launcher behavior.
- The family table lists `claude-tree` as a shared recipe — keep the recipe, update the description.

### 6f. Bump + verify

```bash
for t in android/quest-vr python/cli python/fastapi python/flask rust/cli \
         swift/ios swift/macos typescript/bun-package typescript/nextjs \
         typescript/node-api typescript/node-cli typescript/node-lib \
         typescript/node-worker typescript/react typescript/sveltekit; do
  uv run tools/bump_version.py "$t" major "remove bundled claude_tree.py; claude-tree recipe now launches the project-atlas viewer"
done
uv run tools/sync_check.py
uv run --with cookiecutter tools/render_test.py   # NOTE: needs --with cookiecutter
```

> Known: `render_test.py` aborts mid-run on a pre-existing `bun run test` 120s timeout
> (node-lib) and a pre-existing `bun run lint` failure (node-cli `src/cli.ts`). Neither
> relates to this change. The meaningful signal for this change is `sync_check` green +
> the `[PASS] .claude payload` lines.

### 6g. (optional) Global shell command

If you want `claude-tree` available outside a project too, add to `~/.zshrc`:
```bash
claude-tree() { open "http://localhost:47891/claude-tree?root=${1:-$PWD}"; }
```

## 7. Migration / coordination

- **Already-installed copies**: `finances` and `wallgen` carry the old script (wallgen also got a `just claude-tree` recipe). Once the atlas route ships, swap both recipes to the launcher and delete their `claude_tree.py`. (Generated projects in the wild update via `update_scaffold.py` on the major bump.)
- **Superseded work**: two commits in cookiecutter-templates (`521dd98` redesign, `29de303` natural-size + aesthetics) built the Python viewer. The *design and fixes* port to Svelte (§4c/§5); the Python file itself goes away in the major bump.
- **Sequencing**: build + verify the atlas `/claude-tree` route first (so the launcher has something to open), then do the template teardown (§6).

## 8. Open questions for the user

1. Confirm decisions in §2 (edit-in-atlas vs read-only; Svelte Flow vs mermaid component).
2. Should the global `~/.claude/CLAUDE.md` be editable in atlas, or read-only?
3. Do you want a per-project-row "tree" button in the main `+page.svelte`, or only the standalone `/claude-tree` route + launcher?
