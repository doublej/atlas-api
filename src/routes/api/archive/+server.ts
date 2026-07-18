import { json } from '@sveltejs/kit';
import { setArchived } from '$lib/scanner';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { path, archived } = await request.json();
	if (!path || typeof archived !== 'boolean') {
		return json({ error: 'path (string) and archived (boolean) required' }, { status: 400 });
	}

	await setArchived(path, archived);
	return json({ ok: true, path, archived });
};
