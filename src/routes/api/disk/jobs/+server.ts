import { error, json } from '@sveltejs/kit'
import {
  checkArgs,
  checkCleanPaths,
  isQuickWrite,
  isRead,
  listJobs,
  startJob,
  withConfirmed,
} from '$lib/disk'
import type { RequestHandler } from './$types'

/** The web console's recent jobs, newest first — the page picks a running one back up. */
export const GET: RequestHandler = () => json({ jobs: listJobs() })

/** `{ command, args }` → a detached `atlas disk` job. The page confirmed it, so it runs `--confirmed`. */
export const POST: RequestHandler = async ({ request }) => {
  const { command, args = [] } = await request.json()
  if (typeof command !== 'string' || !Array.isArray(args))
    error(400, 'body is { command, args: string[] }')
  checkArgs(command, args)
  if (isRead(command, args) || isQuickWrite(command, args))
    error(400, `${command} ${args.join(' ')} is not a job`)
  if (command === 'clean') await checkCleanPaths(args)
  return json(startJob([command, ...withConfirmed(args)]))
}
