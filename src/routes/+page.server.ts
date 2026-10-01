import { hostnamesByPath } from '$lib/caddyDev'
import { ATLAS_TEMPLATES_DIR, DEV_FOLDER } from '$lib/config'
import { errorMessage } from '$lib/format'
import { summarizeProject } from '$lib/project-summary'
import { scan } from '$lib/scanner'
import { readTemplateVersions } from '$lib/templates'
import type { PageServerLoad } from './$types'

export type { Project } from '$lib/scanner'

/**
 * The cached catalog, slimmed to what the list renders. A stale cache is served as is: `scan()`
 * revalidates it in the background (one scan at a time) and the page reloads once that lands.
 * `hostnames` maps a project path to its dev hostname, for the row chips.
 */
export const load: PageServerLoad = async () => {
  const [result, templateVersions, hostnames] = await Promise.all([
    scan(DEV_FOLDER, { skipGit: true }).catch((e) => new Error(errorMessage(e))),
    readTemplateVersions(ATLAS_TEMPLATES_DIR),
    hostnamesByPath(),
  ])
  if (result instanceof Error) {
    return {
      projects: [],
      frameworks: [],
      folders: [],
      hosts: [],
      baseDir: DEV_FOLDER,
      stale: false,
      templateVersions,
      hostnames,
      error: `The catalog could not be read: ${result.message}`,
    }
  }
  const { projects, frameworks, folders, hosts = [], baseDir, stale } = result
  return {
    projects: projects.map(summarizeProject),
    frameworks,
    folders,
    hosts,
    baseDir,
    stale,
    templateVersions,
    hostnames,
    error: null,
  }
}
