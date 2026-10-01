import { DEV_FOLDER } from '$lib/config'
import { errorMessage } from '$lib/format'
import { getListeners, type Listener } from '$lib/listeners'
import { auditPorts, type PortCollision } from '$lib/ports'
import { scan } from '$lib/scanner'
import type { PageServerLoad } from './$types'

/** Listeners in the first paint, from the same snapshot as /processes; collisions from the audit. */
export const load: PageServerLoad = async () => {
  try {
    const [{ listeners, updatedAt }, atlas] = await Promise.all([
      getListeners(),
      scan(DEV_FOLDER, { skipGit: true }), // cached, stale-while-revalidate
    ])
    return { listeners, updatedAt, collisions: auditPorts(atlas).collisions, error: null }
  } catch (e) {
    const error = `Listener scan failed: ${errorMessage(e)}`
    return { listeners: [] as Listener[], updatedAt: '', collisions: [] as PortCollision[], error }
  }
}
