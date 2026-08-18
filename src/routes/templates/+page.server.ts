import { join } from 'node:path'
import { adoptionByTemplate } from '$lib/adoption'
import { ATLAS_TEMPLATES_DIR, DEV_FOLDER } from '$lib/config'
import { scan } from '$lib/scanner'
import { lintTemplates } from '$lib/template-lint'
import { discoverTemplates } from '$lib/templates'

export async function load() {
  const { templates, errors } = await discoverTemplates(ATLAS_TEMPLATES_DIR)
  const lint = lintTemplates(templates, errors)
  const { projects } = await scan(DEV_FOLDER) // cached, stale-while-revalidate — no new fs walk
  const adoption = adoptionByTemplate(
    projects,
    templates.map((t) => ({ name: `${t.family}/${t.name}`, currentVersion: t.version ?? '' })),
  )
  const updateScaffoldTool = join(ATLAS_TEMPLATES_DIR, 'tools', 'update_scaffold.py')
  return { templates, errors, lint, adoption, updateScaffoldTool }
}
