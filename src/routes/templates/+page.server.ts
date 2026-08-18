import { ATLAS_TEMPLATES_DIR } from '$lib/config'
import { lintTemplates } from '$lib/template-lint'
import { discoverTemplates } from '$lib/templates'

export async function load() {
  const { templates, errors } = await discoverTemplates(ATLAS_TEMPLATES_DIR)
  const lint = lintTemplates(templates, errors)
  return { templates, errors, lint }
}
