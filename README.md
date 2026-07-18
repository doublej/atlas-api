# Atlas API

SvelteKit 2 app (Svelte 5 runes) that scans a development folder and displays projects in a filterable UI.

## Usage

```bash
bun install
bun run dev
```

## Features

### Scanner

- Recursive scanning (3 levels deep)
- **Project types:** Node.js, Python, Rust, Go
- **Frameworks:** SvelteKit, Svelte, Next, Nuxt, Astro, Remix, Vite, React, Vue, Angular, Express, Fastify, Hono, Elysia, FastAPI, Flask, Django, Streamlit, Tauri, Electron
- **Package managers:** bun, npm, yarn, pnpm, uv (detected from lockfiles)
- Justfile detection with recipe parsing
- Git status with branch name (clean/dirty/no-repo/error)
- Description extraction from package.json, pyproject.toml, Cargo.toml, or README
- Dev command detection (dev, start, serve scripts)
- Stale-while-revalidate caching (60s TTL, `.atlas-cache.json`)

### UI

- **Search** by name, path, or description
- **Filters:**
  - Type (node, python, rust, go)
  - Framework (sveltekit, next, nuxt, etc.)
  - Package manager (bun, npm, yarn, pnpm, uv)
  - Tools (justfile)
  - Features (has dev command, has README)
- **View modes:** flat list or nested folder tree
- **Project cards:**
  - Git status indicator with branch name
  - Type/framework/runner badges
  - Editable description (double-click)
  - Clickable npm scripts
  - Clickable just recipes
  - Expandable README preview
  - Last modified date
- **Actions:**
  - Run dev server (auto-opens browser after 2s)
  - Run any npm/bun/yarn/pnpm script
  - Run just recipes
  - Open in iTerm
  - Open in Finder
  - Rename project folder
  - Move project to different folder

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET | Main data endpoint (cached) |
| `/api/projects?dir=/path` | GET | Scan custom directory |
| `/api/git` | POST | Batch git status check |
| `/api/readme` | POST | Lazy README loading |
| `/api/run` | POST | Spawn dev server |
| `/api/refresh` | POST | Force rescan |
| `/api/iterm` | POST | Open iTerm in project |
| `/api/finder` | POST | Open Finder in project |
| `/api/description` | PUT | Update project description |
| `/api/rename` | POST | Rename project folder |
| `/api/move` | POST | Move project folder |
| `/api/agent-files?path=...&file=claude\|agents` | GET | Read CLAUDE.md or AGENTS.md |
| `/api/agent-files` | POST | Create/open CLAUDE.md or AGENTS.md |
| `/api/agent-files` | PUT | Copy between CLAUDE.md and AGENTS.md |

## CLI

```bash
bun run scan [baseDir] [output.json]
```

## Output Format

```json
{
  "baseDir": "/path/to/dev",
  "scannedAt": "2025-12-05T...",
  "projects": [
    {
      "name": "my-app",
      "path": "/full/path",
      "relativePath": "web/my-app",
      "type": "node|python|rust|go",
      "runner": "bun|npm|yarn|pnpm|uv",
      "framework": "sveltekit|next|nuxt|astro|...",
      "description": "...",
      "scripts": {},
      "devCommand": "dev",
      "hasJustfile": true,
      "justRecipes": ["dev", "build", "test"],
      "modifiedAt": "..."
    }
  ]
}
```
