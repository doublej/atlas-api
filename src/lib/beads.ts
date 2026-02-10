import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

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

function generateTicketId(projectPath: string): string {
	const dirName = projectPath.split('/').pop() || 'PRJ';
	const prefix = dirName
		.replace(/[^a-zA-Z]/g, '')
		.toUpperCase()
		.slice(0, 3)
		.padEnd(3, 'X');

	const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
	const suffix = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

	return `${prefix}-${suffix}`;
}

export async function createBeadsTicket(
	projectPath: string,
	input: CreateTicketInput
): Promise<BeadsTicket> {
	const beadsDir = join(projectPath, '.beads');
	const issuesFile = join(beadsDir, 'issues.jsonl');

	await mkdir(beadsDir, { recursive: true });

	const now = new Date().toISOString();
	const ticket: BeadsTicket = {
		id: generateTicketId(projectPath),
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

	let existingContent = '';
	try {
		existingContent = await readFile(issuesFile, 'utf-8');
	} catch {
		// File doesn't exist yet, that's fine
	}

	const newContent = existingContent + (existingContent && !existingContent.endsWith('\n') ? '\n' : '') + JSON.stringify(ticket) + '\n';

	await writeFile(issuesFile, newContent, 'utf-8');

	return ticket;
}
