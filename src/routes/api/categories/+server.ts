import { json } from '@sveltejs/kit';
import { scan } from '$lib/scanner';
import { deriveCategories } from '$lib/categories';
import { DEV_FOLDER } from '$lib/config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const atlas = await scan(DEV_FOLDER); // cached, stale-while-revalidate — no new fs walk
	return json({ categories: deriveCategories(atlas) });
};
