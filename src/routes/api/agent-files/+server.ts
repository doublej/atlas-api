import { json } from '@sveltejs/kit';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { exec } from 'node:child_process';
import type { RequestHandler } from './$types';

type FileType = 'claude' | 'agents';
const FILES: Record<FileType, string> = { claude: 'CLAUDE.md', agents: 'AGENTS.md' };

async function getFilePath(projectPath: string, file: FileType): Promise<string> {
	return join(projectPath, FILES[file]);
}

async function readAgentFile(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, 'utf-8');
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async ({ url }) => {
	const path = url.searchParams.get('path');
	const file = url.searchParams.get('file') as FileType;

	if (!path || !file || !FILES[file]) {
		return json({ error: 'Missing path or invalid file type' }, { status: 400 });
	}

	const filePath = await getFilePath(path, file);
	const content = await readAgentFile(filePath);
	const exists = content !== null;

	return json({ content, exists, file: FILES[file] });
};

export const POST: RequestHandler = async ({ request }) => {
	const { path, file, content, open: shouldOpen } = await request.json() as {
		path: string;
		file: FileType;
		content?: string;
		open?: boolean;
	};

	if (!path || !file || !FILES[file]) {
		return json({ error: 'Missing path or invalid file type' }, { status: 400 });
	}

	const filePath = await getFilePath(path, file);

	// Create file if content provided or file doesn't exist
	if (content !== undefined) {
		await writeFile(filePath, content);
	} else {
		try {
			await stat(filePath);
		} catch {
			await writeFile(filePath, `# ${FILES[file]}\n\n`);
		}
	}

	// Open in default editor
	if (shouldOpen) {
		exec(`open "${filePath}"`);
	}

	return json({ created: true, path: filePath });
};

export const PUT: RequestHandler = async ({ request }) => {
	const { path, from, to } = await request.json() as {
		path: string;
		from: FileType;
		to: FileType;
	};

	if (!path || !from || !to || !FILES[from] || !FILES[to]) {
		return json({ error: 'Missing path or invalid file types' }, { status: 400 });
	}

	const fromPath = await getFilePath(path, from);
	const toPath = await getFilePath(path, to);

	const content = await readAgentFile(fromPath);
	if (content === null) {
		return json({ error: `${FILES[from]} does not exist` }, { status: 404 });
	}

	await writeFile(toPath, content);
	return json({ copied: true, from: FILES[from], to: FILES[to] });
};
