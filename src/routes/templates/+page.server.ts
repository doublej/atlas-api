import { join } from 'node:path'
import { adoptionByTemplate } from '$lib/adoption'
import { ATLAS_TEMPLATES_DIR, DEV_FOLDER } from '$lib/config'
import { errorMessage } from '$lib/format'
import type { Project } from '$lib/scanner'
import { scan } from '$lib/scanner'
import { lintTemplates } from '$lib/template-lint'
import { type DiscoveredTemplate, discoverTemplates, type TemplateError } from '$lib/templates'

/**
 * Two readings — the template folder and the cached scan (for adoption). Each may fail on
 * its own: a failed scan still shows the templates, so every failure is a line in `failures`
 * and the page always renders.
 */
export async function load() {
  const failures: string[] = []
  const { templates, errors } = await discoverTemplates(ATLAS_TEMPLATES_DIR).catch(
    (e): { templates: DiscoveredTemplate[]; errors: TemplateError[] } => {
      failures.push(`templates: ${errorMessage(e)}`)
      return { templates: [], errors: [] }
    },
  )
  const lint = lintTemplates(templates, errors)
  // cached, stale-while-revalidate — no new fs walk
  const projects = await scan(DEV_FOLDER)
    .then((a) => a.projects)
    .catch((e): Project[] => {
      failures.push(`scan: ${errorMessage(e)}`)
      return []
    })
  const adoption = adoptionByTemplate(
    projects,
    templates.map((t) => ({ name: `${t.family}/${t.name}`, currentVersion: t.version ?? '' })),
  )
  const updateScaffoldTool = join(ATLAS_TEMPLATES_DIR, 'tools', 'update_scaffold.py')
  return {
    templates,
    errors,
    lint,
    adoption,
    updateScaffoldTool,
    templatesDir: ATLAS_TEMPLATES_DIR,
    failures,
  }
}
