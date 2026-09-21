import { type AtlasConfig, DEFAULT_CONFIG, readConfig } from '$lib/atlasFile'
import { DEV_FOLDER } from '$lib/config'
import type { LaunchctlState } from '$lib/launchctl'
import { auditPorts } from '$lib/ports'
import { scan } from '$lib/scanner'
import type { DaemonDef } from '$shared/daemons'
import { getHosts } from '$shared/hosts'
import type { PageServerLoad } from './$types'

/** A `GET /api/daemons` row: the registry entry joined with live launchctl state. */
export type DaemonRow = DaemonDef & {
  state: LaunchctlState
  scheduled: boolean
  portInUse: boolean | null
  stale: boolean
}

const reason = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Four independent readings of the machine. Each one is allowed to fail on its own — a dead
 * `launchctl` must not take the hosts card down with it — so every source resolves to a value
 * or to a line in `errors`, and the page always renders.
 */
export const load: PageServerLoad = async ({ fetch }) => {
  const errors: string[] = []

  const [atlas, config, daemons] = await Promise.all([
    // Cached, stale-while-revalidate — no new fs walk. Carries `hosts[]` and feeds the audit.
    scan(DEV_FOLDER, { skipGit: true }).catch((e) => {
      errors.push(`scan: ${reason(e)}`)
      return null
    }),
    readConfig(DEV_FOLDER).catch((e) => {
      errors.push(`scanner config: ${reason(e)}`)
      return { ...DEFAULT_CONFIG, depth: {}, force: {} } as AtlasConfig
    }),
    fetch('/api/daemons')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return ((await r.json()) as { daemons: DaemonRow[] }).daemons
      })
      .catch((e) => {
        errors.push(`daemons: ${reason(e)}`)
        return null
      }),
  ])

  return {
    hosts: getHosts(),
    hostStates: atlas?.hosts ?? [],
    audit: atlas ? auditPorts(atlas) : null,
    config,
    daemons,
    errors,
  }
}
