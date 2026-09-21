import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { json } from '@sveltejs/kit'
import { getHosts, type HostDef, type HostRegistry, registry } from '$shared/hosts'
import type { RequestHandler } from './$types'

/**
 * `shared/hosts.json` is imported as a module, so the running daemon holds the copy it started
 * with. Writing it is therefore a two-step: the file changes now, the catalog after a restart —
 * which the response says out loud rather than leaving the UI to claim a change that has not
 * landed.
 */
// Resolved from the working directory, not `import.meta.url`: this module is bundled into
// `build/server` for the daemon, where a path relative to the source tree points nowhere. Both
// `vite dev` and the launchd job run from `atlas-api/`, which the plist pins.
const REGISTRY_PATH = join(process.cwd(), '..', 'shared', 'hosts.json')

export const GET: RequestHandler = async () => json({ hosts: getHosts() })

export const PUT: RequestHandler = async ({ request }) => {
  const { hosts } = await request.json()
  if (!Array.isArray(hosts) || hosts.length === 0) {
    return json({ error: 'hosts (non-empty array) required' }, { status: 400 })
  }
  const bad = hosts.find((h: HostDef) => !h?.id || !h?.root || typeof h.ssh === 'undefined')
  if (bad)
    return json({ error: 'each host needs id, root and ssh (null for primary)' }, { status: 400 })
  if (hosts.filter((h: HostDef) => h.ssh === null).length !== 1) {
    return json({ error: 'exactly one host must have ssh: null (the primary)' }, { status: 400 })
  }

  const next: HostRegistry = { version: registry.version, hosts }
  await writeFile(REGISTRY_PATH, `${JSON.stringify(next, null, 2)}\n`)
  return json({ ...next, restartRequired: true })
}
