# Project Index

Scan and index development projects. Detects Node.js, Python, Rust, and Go projects.

## Usage

```bash
bun install
bun run dev
```

## Data API

JSON endpoint:
```
GET /api/projects
GET /api/projects?dir=/custom/path
```

CLI scanner:
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
      "description": "...",
      "scripts": {},
      "devCommand": "dev",
      "modifiedAt": "..."
    }
  ]
}
```

## Features

- Recursive scanning (3 levels deep)
- Detects project type from package.json, pyproject.toml, Cargo.toml, go.mod
- Detects package manager from lockfiles
- Extracts descriptions from manifests or README
- Run dev servers from UI
- Open iTerm/Finder in project folder
