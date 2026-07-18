import { json } from '@sveltejs/kit';
import { join } from 'node:path';
import type { RequestHandler } from './$types';
import { scan, enrichCacheWithGit } from '$lib/scanner';
import { DEV_FOLDER } from '$lib/config';

export const POST: RequestHandler = async () => {
	const result = await scan(DEV_FOLDER, { skipGit: true, forceRefresh: true });

	// Background: enrich cache with git statuses for next cold start
	const cachePath = join(DEV_FOLDER, '.atlas-cache.json');
	const { fromCache, stale, ...atlas } = result;
	enrichCacheWithGit(cachePath, atlas).catch(() => {});

	return json(result);
};
