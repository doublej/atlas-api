import { DEV_FOLDER } from '$lib/config'
import { type ScanResult, scan } from '$lib/scanner'

export type { Project } from '$lib/scanner'

export async function load(): Promise<ScanResult> {
  return scan(DEV_FOLDER, { skipGit: true })
}
