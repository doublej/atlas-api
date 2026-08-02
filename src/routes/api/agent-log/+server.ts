import { json } from '@sveltejs/kit';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';
import { resolveInCatalog } from '$lib/claude-tree';
import { DEV_FOLDER } from '$lib/config';
import type { RequestHandler } from './$types';

const execFileAsync = promisify(execFile);

type EventRow = {
	at_ms: number;
	kind: string;
	op_id: string;
	operation: string;
	actor: string;
	bead: string;
	scopes: string;
	summary: string;
	expires_ms: number | null;
	outcome: string;
	detail: string;
};

type ParsedEvent = Omit<EventRow, 'scopes' | 'detail'> & {
	scopes: string[];
	detail: Record<string, unknown>;
};

const EMPTY = { events: [], activeIntents: 0, latestHandoff: null };
const SINCE_MS = 30 * 60 * 1000;

function parseRow(row: EventRow): ParsedEvent {
	let scopes: string[] = [];
	let detail: Record<string, unknown> = {};
	try {
		scopes = JSON.parse(row.scopes) as string[];
		detail = JSON.parse(row.detail) as Record<string, unknown>;
	} catch { /* corrupt row — keep the raw-typed fields it does have */ }
	return { ...row, scopes, detail };
}

// Keep in sync with atlas-cli src/agent-log/render.ts visibleRows.
function visibleRows(rows: EventRow[]): EventRow[] {
	const now = Date.now();
	const since = now - SINCE_MS;
	const ended = new Set(rows.filter((row) => row.kind === 'end').map((row) => row.op_id));
	const latestHandoff = rows.findLast((row) => row.kind === 'handoff');
	return rows.filter((row) => {
		if (row.kind === 'intent') return !ended.has(row.op_id) && (row.expires_ms ?? 0) >= now;
		if (row.kind === 'handoff') return row === latestHandoff || row.at_ms >= since;
		return row.kind === 'end' ? row.at_ms >= since : (row.expires_ms ?? 0) >= now;
	});
}

export const GET: RequestHandler = async ({ url }) => {
	const path = url.searchParams.get('path');
	if (!path) return json({ error: 'Missing path' }, { status: 400 });
	const safe = resolveInCatalog(path, DEV_FOLDER);
	if (!safe) return json({ error: 'path is outside the project catalog' }, { status: 403 });

	let commonDir: string;
	try {
		const { stdout } = await execFileAsync('git', [
			'-C', safe, 'rev-parse', '--path-format=absolute', '--git-common-dir'
		]);
		commonDir = stdout.trim();
	} catch {
		return json(EMPTY); // not a git repo — no journal to serve
	}

	let rows: EventRow[];
	try {
		const db = new Database(join(commonDir, 'agent-log.sqlite'), { readonly: true });
		try {
			rows = db.query('SELECT * FROM events ORDER BY seq').all() as EventRow[];
		} finally {
			db.close();
		}
	} catch {
		return json(EMPTY); // missing or locked db reads as an empty journal, never a 500
	}

	const events = visibleRows(rows).map(parseRow);
	const handoff = rows.filter((row) => row.kind === 'handoff').at(-1);
	return json({
		events,
		activeIntents: events.filter((event) => event.kind === 'intent').length,
		latestHandoff: handoff ? parseRow(handoff) : null
	});
};
