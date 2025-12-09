import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scan } from '$lib/scanner';
import { DEV_FOLDER } from '../../+page.server';

export const POST: RequestHandler = async () => {
	const result = await scan(DEV_FOLDER, { skipGit: true, forceRefresh: true });
	return json(result);
};
