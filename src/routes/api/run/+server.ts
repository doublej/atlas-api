import { json } from '@sveltejs/kit';
import { spawn } from 'node:child_process';
import type { RequestHandler } from './$types';

const runningProcesses = new Map<string, { port?: number; pid: number }>();

export const POST: RequestHandler = async ({ request }) => {
	const { path, command, runner, type } = await request.json();

	if (!path || !command) {
		return json({ error: 'Missing path or command' }, { status: 400 });
	}

	// Kill existing process for this path
	const existing = runningProcesses.get(path);
	if (existing) {
		try {
			process.kill(existing.pid);
		} catch { /* already dead */ }
		runningProcesses.delete(path);
	}

	// Find available port
	const port = 3000 + Math.floor(Math.random() * 1000);

	let cmd: string;
	let args: string[];

	if (type === 'just') {
		cmd = 'just';
		args = [command];
	} else if (runner === 'uv') {
		cmd = 'uv';
		args = ['run', command];
	} else {
		cmd = runner === 'bun' ? 'bun' : runner === 'yarn' ? 'yarn' : runner === 'pnpm' ? 'pnpm' : 'npm';
		args = runner === 'npm' ? ['run', command, '--', '--port', String(port)] : [command, '--port', String(port)];
	}

	const child = spawn(cmd, args, {
		cwd: path,
		detached: true,
		stdio: 'ignore'
	});

	child.unref();

	runningProcesses.set(path, { port, pid: child.pid! });

	return json({ port, pid: child.pid, url: `http://localhost:${port}` });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { path } = await request.json();

	const existing = runningProcesses.get(path);
	if (existing) {
		try {
			process.kill(existing.pid);
		} catch { /* already dead */ }
		runningProcesses.delete(path);
		return json({ stopped: true });
	}

	return json({ stopped: false });
};
