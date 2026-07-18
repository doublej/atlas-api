import { scan, type ScanResult } from '$lib/scanner';
import { DEV_FOLDER } from '$lib/config';

export type { Project } from '$lib/scanner';

export async function load(): Promise<ScanResult> {
	return scan(DEV_FOLDER, { skipGit: true });
}
