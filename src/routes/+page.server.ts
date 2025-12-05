import { scan, type ProjectIndex } from '$lib/scanner';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type { Project } from '$lib/scanner';

const PROJECT_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const DEV_FOLDER = dirname(PROJECT_ROOT); // Parent of project-index

export async function load(): Promise<ProjectIndex> {
	return scan(DEV_FOLDER);
}
