import { json } from '@sveltejs/kit';
import { exec } from 'node:child_process';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { path } = await request.json();

	if (!path) {
		return json({ error: 'Missing path' }, { status: 400 });
	}

	const script = `
		tell application "iTerm"
			activate
			create window with default profile
			tell current session of current window
				write text "cd ${path.replace(/"/g, '\\"')}"
			end tell
		end tell
	`;

	return new Promise((resolve) => {
		exec(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`, (error) => {
			if (error) {
				resolve(json({ error: error.message }, { status: 500 }));
			} else {
				resolve(json({ opened: true }));
			}
		});
	});
};
