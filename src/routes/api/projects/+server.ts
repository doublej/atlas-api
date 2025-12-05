import { json } from '@sveltejs/kit';
import { scan } from '$lib/scanner';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RequestHandler } from './$types';

const PROJECT_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const DEFAULT_DIR = dirname(PROJECT_ROOT);

export const GET: RequestHandler = async ({ url }) => {
	const baseDir = url.searchParams.get('dir') || DEFAULT_DIR;
	const index = await scan(baseDir);

	return json(index, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'max-age=60'
		}
	});
};
