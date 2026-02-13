import { scan, type ScanResult } from '$lib/scanner';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type { Project } from '$lib/scanner';

export const DEV_FOLDER = join(homedir(), 'Documents', 'development');

export async function load(): Promise<ScanResult> {
	return scan(DEV_FOLDER, { skipGit: true });
}
