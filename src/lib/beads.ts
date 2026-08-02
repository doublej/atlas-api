import { stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

export interface BeadsTicket {
	id: string;
	title: string;
	description?: string;
	status: 'open' | 'in_progress' | 'closed';
	priority?: number;
	issue_type?: 'task' | 'feature' | 'chore' | 'bug';
	created_at: string;
	updated_at: string;
	closed_at?: string;
	labels?: string[];
	dependencies?: unknown[];
}

interface CreateTicketInput {
	title: string;
	description?: string;
	priority?: number;
	issue_type?: 'task' | 'feature' | 'chore' | 'bug';
	labels?: string[];
}

// launchd runs atlas-api with a minimal PATH — probe known install locations before
// falling back to whatever `bd` the environment resolves.
const BD_CANDIDATES = [join(homedir(), '.local', 'bin', 'bd'), '/opt/homebrew/bin/bd'];

async function resolveBd(): Promise<string> {
	for (const candidate of BD_CANDIDATES) {
		try {
			await stat(candidate);
			return candidate;
		} catch { /* not installed here */ }
	}
	return 'bd';
}

export async function createBeadsTicket(
	projectPath: string,
	input: CreateTicketInput
): Promise<BeadsTicket> {
	try {
		await stat(join(projectPath, '.beads'));
	} catch {
		throw new Error('no beads database');
	}

	const args = ['-C', projectPath, 'create', input.title, '--silent'];
	if (input.description) args.push('-d', input.description);
	if (input.priority !== undefined) args.push('-p', String(input.priority));
	if (input.issue_type) args.push('-t', input.issue_type);
	if (input.labels?.length) args.push('-l', input.labels.join(','));

	const { stdout } = await execFileAsync(await resolveBd(), args);
	const id = stdout.trim();
	if (!id) throw new Error('bd create returned no issue id');

	const now = new Date().toISOString();
	return {
		id,
		title: input.title,
		description: input.description,
		status: 'open',
		priority: input.priority ?? 3,
		issue_type: input.issue_type ?? 'task',
		created_at: now,
		updated_at: now,
		labels: input.labels,
		dependencies: []
	};
}
