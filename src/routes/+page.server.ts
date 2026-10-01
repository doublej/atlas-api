import { hostnamesByPath } from '$lib/caddyDev'
import { ATLAS_TEMPLATES_DIR, DEV_FOLDER } from '$lib/config'
import type { HostnameChipData } from '$lib/hostnames/types'
import { type ScanResult, scan } from '$lib/scanner'
import { discoverTemplates } from '$lib/templates'

export type { Project } from '$lib/scanner'

export async function load(): Promise<
  ScanResult & {
    templateVersions: Record<string, string>
    /** Project path → its dev hostname, for the row chips. */
    hostnames: Record<string, HostnameChipData>
  }
> {
  const [result, { templates }, hostnames] = await Promise.all([
    scan(DEV_FOLDER, { skipGit: true }),
    discoverTemplates(ATLAS_TEMPLATES_DIR),
    hostnamesByPath(),
  ])
  const templateVersions = Object.fromEntries(
    templates.filter((t) => t.version).map((t) => [`${t.family}/${t.name}`, t.version as string]),
  )
  return { ...result, templateVersions, hostnames }
}
