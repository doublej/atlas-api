import { getServices, type ServiceDef } from '$shared/services'
import type { Socket } from './ports'
import { getSnapshot, type Snapshot } from './processes/snapshot'
import type { ProcessKind } from './processes/types'

/**
 * Every TCP listener on this Mac, joined with what atlas knows about it — the Active Ports
 * dashboard, folded into the console. Grouped by who owns the port, not by a hand-kept category.
 * A projection of the process snapshot: no scan of its own.
 */
export type ListenerGroup = 'project' | 'service' | 'docker' | 'system'

export interface Listener {
  port: number
  pid: number
  name: string
  /** Redacted, like every command the snapshot hands out. */
  command: string
  cwd?: string
  group: ListenerGroup
  project?: { name: string; path: string; framework?: string }
  docker?: string
  hostname?: string
  /** pid + startedAt is what `POST /api/processes/stop` takes. */
  startedAt: string
  pgid: number
  kind: ProcessKind
}

interface RawListener {
  port: number
  pid: number
  command: string
}

/**
 * Pure: one entry per port. A port held by `selfPid` as well as another process belongs to the
 * other one: atlas's own loopback bridges sit on the service's port.
 */
export function ownersByPort(sockets: Socket[], selfPid: number): RawListener[] {
  const byPort = new Map<number, RawListener>()
  for (const { port, pid, command } of sockets) {
    const seen = byPort.get(port)
    if (!seen || (seen.pid === selfPid && pid !== selfPid)) byPort.set(port, { port, pid, command })
  }
  return [...byPort.values()].sort((a, b) => a.port - b.port)
}

/** Pure: the snapshot's listeners, owner-joined: service, then project, then docker, else system. */
export function listenersOf(snap: Snapshot, services: ServiceDef[] = getServices()): Listener[] {
  const byPort = new Map(services.map((s) => [s.port, s]))
  const byPath = new Map(snap.projects.map((p) => [p.path, p]))
  const hostFor = (match: (h: Snapshot['hostnames'][number]) => boolean) =>
    snap.hostnames.find(match)?.local

  return ownersByPort(snap.sockets, snap.self.pid).flatMap(
    ({ port, pid, command: short }): Listener[] => {
      const proc = snap.byPid.get(pid)
      // ps and netstat run side by side: a server born in between shows up in the next snapshot.
      if (!proc) return []
      const { name, cwd, startedAt, pgid, kind } = proc
      const base = { port, pid, name, command: proc.command || short, cwd, startedAt, pgid, kind }
      const service = byPort.get(port)
      const project = proc.project && byPath.get(proc.project.path)
      const container = snap.docker.get(port)

      if (service) {
        const hostname = hostFor((h) => h.slug === service.slug)
        return [{ ...base, group: 'service' as const, name: service.name, hostname }]
      }
      if (project) {
        // The hostname routes to one port, the project's own: not to a second server it runs.
        const hostname = port === project.port ? hostFor((h) => h.path === project.path) : undefined
        const { name, path, framework } = project
        return [
          {
            ...base,
            group: 'project' as const,
            name,
            project: { name, path, framework },
            hostname,
          },
        ]
      }
      if (container)
        return [{ ...base, group: 'docker' as const, name: container, docker: container }]
      return [{ ...base, group: 'system' as const }]
    },
  )
}

export async function getListeners(
  fresh = false,
): Promise<{ listeners: Listener[]; updatedAt: string }> {
  const snap = await getSnapshot(fresh)
  return { listeners: listenersOf(snap), updatedAt: snap.generatedAt }
}
