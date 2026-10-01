import { stat } from 'node:fs/promises'
import { json } from '@sveltejs/kit'
import { isScheduledPlist, jobState, listJobs } from '$lib/launchctl'
import { listSockets } from '$lib/ports'
import { getDaemons } from '$shared/daemons'
import type { RequestHandler } from './$types'

/** One `launchctl list` and one `netstat` for the whole registry, not two spawns per daemon. */
export const GET: RequestHandler = async () => {
  const [jobs, listening] = await Promise.all([
    listJobs(),
    // null = the read failed: every port reads "check failed", never "not bound".
    listSockets()
      .then((sockets) => new Set(sockets.map((s) => s.port)))
      .catch(() => null),
  ])
  const daemons = await Promise.all(
    getDaemons().map(async (d) => {
      const [scheduled, stale] = await Promise.all([
        isScheduledPlist(d.plist),
        d.project
          ? stat(d.project)
              .then(() => false)
              .catch(() => true)
          : false,
      ])
      const portInUse = d.port ? (listening?.has(d.port) ?? null) : null
      return { ...d, state: jobState(jobs, d.label, scheduled), scheduled, portInUse, stale }
    }),
  )
  return json({ daemons })
}
