import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getReadme } from '$lib/scanner';

export const POST: RequestHandler = async ({ request }) => {
	const { path } = await request.json();
	const readme = await getReadme(path);
	return json({ readme });
};
