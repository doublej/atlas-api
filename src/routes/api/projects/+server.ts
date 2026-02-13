import { json } from '@sveltejs/kit';
import { scan } from '$lib/scanner';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

const DEFAULT_DIR = join(homedir(), 'Documents', 'development');

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
