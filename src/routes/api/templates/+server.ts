import { json } from '@sveltejs/kit';
import { discoverTemplates } from '$lib/templates';
import { ATLAS_TEMPLATES_DIR } from '$lib/config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const templates = await discoverTemplates(ATLAS_TEMPLATES_DIR);
	return json({ templates });
};
