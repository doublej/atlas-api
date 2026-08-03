import { spawn } from 'node:child_process'
import { getDaemons } from '$shared/daemons'
import type { Framework, ProjectAtlas } from './scanner'

const LSOF_TIMEOUT_MS = 5000

/** Dedicated range for atlas-allocated ports — kept clear of every ecosystem's own defaults (3000/5173/8000/5000/8080). */
export const ATLAS_PORT_RANGE = { min: 4100, max: 4999 }

/** Frameworks that bind a dev-server port; used to flag projects with no declared port. */
const PORT_BEARING_FRAMEWORKS = new Set<Framework>([
  'next',
  'react',
  'sveltekit',
  'svelte',
  'vite',
  'fastapi',
  'flask',
  'elysia',
])

export function checkPort(port: number): Promise<boolean | null> {
  return new Promise((resolve) => {
    const child = spawn('/usr/sbin/lsof', ['-i', `:${port}`])
    let hasOutput = false
    child.stdout.on('data', () => (hasOutput = true))
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve(null)
    }, LSOF_TIMEOUT_MS)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(hasOutput)
      else if (code === 1) resolve(false)
      else resolve(null)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
  })
}

function reservedPorts(atlas: ProjectAtlas): Set<number> {
  const reserved = new Set<number>()
  for (const d of getDaemons()) if (d.port) reserved.add(d.port)
  for (const p of atlas.projects) if (p.port) reserved.add(p.port)
  return reserved
}

/** Walk the atlas port range, skipping declared ports and anything `lsof` sees as live. */
export async function allocatePort(atlas: ProjectAtlas): Promise<number> {
  const reserved = reservedPorts(atlas)

  for (let port = ATLAS_PORT_RANGE.min; port <= ATLAS_PORT_RANGE.max; port++) {
    if (reserved.has(port)) continue

    const inUse = await checkPort(port)
    if (inUse === true) continue
    if (inUse === null)
      console.warn(`ports: lsof check timed out for port ${port} — allocating anyway`)

    return port
  }

  throw new Error(`No available port in range ${ATLAS_PORT_RANGE.min}-${ATLAS_PORT_RANGE.max}`)
}

export interface PortSource {
  kind: 'daemon' | 'project'
  label: string
  name: string
}

export interface PortCollision {
  port: number
  sources: PortSource[]
}

export interface UnmanagedProject {
  path: string
  relativePath: string
  framework: Framework
}

export interface PortAudit {
  collisions: PortCollision[]
  unmanaged: UnmanagedProject[]
}

/**
 * Report-only: never guesses or backfills a port into a project. Surfaces collisions
 * across daemons + scanned projects, and flags port-bearing frameworks with no declared
 * port. Known gap: Go/Rust/Swift projects don't get a distinct enough `framework` tag
 * today to be flagged here.
 */
export function auditPorts(atlas: ProjectAtlas): PortAudit {
  const bySource = new Map<number, PortSource[]>()

  for (const d of getDaemons()) {
    if (!d.port) continue
    const sources = bySource.get(d.port) ?? []
    sources.push({ kind: 'daemon', label: d.label, name: d.name })
    bySource.set(d.port, sources)
  }

  for (const p of atlas.projects) {
    if (!p.port) continue
    const sources = bySource.get(p.port) ?? []
    sources.push({ kind: 'project', label: p.relativePath, name: p.name })
    bySource.set(p.port, sources)
  }

  const collisions: PortCollision[] = [...bySource.entries()]
    .filter(([, sources]) => sources.length > 1)
    .map(([port, sources]) => ({ port, sources }))
    .sort((a, b) => a.port - b.port)

  const unmanaged: UnmanagedProject[] = atlas.projects
    .filter((p) => p.framework && PORT_BEARING_FRAMEWORKS.has(p.framework) && !p.port)
    .map((p) => ({ path: p.path, relativePath: p.relativePath, framework: p.framework! }))

  return { collisions, unmanaged }
}
