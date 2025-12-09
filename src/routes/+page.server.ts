import { scan, type ScanResult } from '$lib/scanner';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type { Project } from '$lib/scanner';

const PROJECT_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const DEV_FOLDER = dirname(dirname(PROJECT_ROOT)); // development folder

export async function load(): Promise<ScanResult> {
	return scan(DEV_FOLDER, { skipGit: true });
}
