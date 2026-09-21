import { error, json } from '@sveltejs/kit'
import { checkArgs, checkCleanPaths, diskJson, isRead } from '$lib/disk'
import type { RequestHandler } from './$types'

/** `?cmd=<sub>&arg=…&arg=…` → `atlas disk <sub> <args> --json`, side-effect-free commands only. */
export const GET: RequestHandler = async ({ url }) => {
  const cmd = url.searchParams.get('cmd') ?? ''
  const args = url.searchParams.getAll('arg')
  checkArgs(cmd, args)
  if (!isRead(cmd, args)) error(400, `${cmd} ${args.join(' ')} changes files — start it as a job`)
  if (cmd === 'clean') await checkCleanPaths(args)
  try {
    return json(await diskJson([cmd, ...args]))
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 502 })
  }
}
