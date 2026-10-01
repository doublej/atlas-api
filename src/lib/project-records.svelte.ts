import { fetchAllProjects, fetchProject } from '$lib/browser/api'
import { errorMessage } from '$lib/format'
import type { Project } from '$lib/scanner'

/**
 * Full project records for "/", whose page data carries only the list's fields: one record per
 * row when it opens, or all of them once for the Cards/Nested views, which render the full row
 * for every project.
 */
export class ProjectRecords {
  /** Every record by path, once `loadAll()` (or `keep()`) has run. */
  all = $state.raw<Map<string, Project> | null>(null)
  error = $state<string | null>(null)
  #pending = new Map<string, Promise<Project>>()

  /** One record; a failed read is forgotten, so opening the row again retries it. */
  get(path: string): Promise<Project> {
    const known = this.all?.get(path)
    if (known) return Promise.resolve(known)
    let r = this.#pending.get(path)
    if (!r) {
      r = fetchProject(path)
      this.#pending.set(path, r)
      r.catch(() => this.#pending.delete(path))
    }
    return r
  }

  /** Replace everything with a fresh catalog (after a rescan). */
  keep(projects: Project[]): void {
    this.#pending.clear()
    this.all = new Map(projects.map((p) => [p.path, p]))
  }

  loadAll(): void {
    this.error = null
    fetchAllProjects()
      .then(({ projects }) => this.keep(projects))
      .catch((e) => {
        this.error = errorMessage(e)
      })
  }
}
