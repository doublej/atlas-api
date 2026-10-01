import { errorMessage } from '$lib/format'
import { getSnapshot } from '$lib/processes/snapshot'
import type { ProcessSnapshot } from '$lib/processes/types'
import { viewOf } from '$lib/processes/view'
import type { PageServerLoad } from './$types'

/** A dev server's restart needs its project's dev command, which the snapshot does not carry. */
export type Runnable = Record<string, { command: string; runner?: string }>

/** The rows are in the first paint; the page then polls `GET /api/processes`. */
export const load: PageServerLoad = async ({ url }) => {
  const all = url.searchParams.get('all') === '1'
  try {
    const snap = await getSnapshot()
    const view: ProcessSnapshot = viewOf(snap, { all, projects: [], kinds: [], history: true })
    // ponytail: only the projects running an atlas dev server now; one started later restarts after a reload.
    const running = new Set(
      view.rows.flatMap((r) => (r.atlasRun && r.project ? [r.project.path] : [])),
    )
    const runnable: Runnable = Object.fromEntries(
      snap.projects.flatMap((p) =>
        running.has(p.path) && p.devCommand
          ? [[p.path, { command: p.devCommand, runner: p.runner }]]
          : [],
      ),
    )
    return { view, runnable, error: null }
  } catch (e) {
    return {
      view: null,
      runnable: {} as Runnable,
      error: `Process snapshot failed: ${errorMessage(e)}`,
    }
  }
}
