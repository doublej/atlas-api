import { json } from '@sveltejs/kit';
import { createBeadsTicket } from '$lib/beads';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { path, title, description, priority, issue_type, labels } = await request.json();

	if (!path || !title) {
		return json({ error: 'Missing path or title' }, { status: 400 });
	}

	try {
		const ticket = await createBeadsTicket(path, {
			title,
			description,
			priority,
			issue_type,
			labels
		});
		return json({ ticket });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to create ticket';
		return json({ error: message }, { status: message === 'no beads database' ? 400 : 500 });
	}
};
