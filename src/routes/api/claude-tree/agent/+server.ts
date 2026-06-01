import { json } from '@sveltejs/kit';
import { resolveInCatalog } from '$lib/claude-tree';
import { getAction, type AgentEngine } from '$lib/claude-tree-actions';
import { runAction } from '$lib/claude-tree-agent';
import type { EntityKind } from '$lib/claude-tree-entities';
import { DEV_FOLDER } from '$lib/config';
import type { RequestHandler } from './$types';

// Same catalog boundary as the tree endpoint: the path being acted on must
// resolve inside ~/Documents/development (or the global ~/.claude/CLAUDE.md).
const BASE_DIR = DEV_FOLDER;

interface AgentBody {
	path: string;
	content: string; // the live (possibly unsaved) buffer — the agent's full context
	engine: AgentEngine;
	actionId: string;
	locked: boolean;
	question?: string;
	entity: { text: string; startLine: number; endLine: number; kind: EntityKind };
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json()) as AgentBody;
	const safe = resolveInCatalog(body.path, BASE_DIR);
	if (!safe) return json({ error: 'path is outside the project catalog' }, { status: 403 });

	const action = getAction(body.actionId);
	if (!action) return json({ error: 'unknown action' }, { status: 400 });
	if (action.needsInput && !body.question?.trim())
		return json({ error: 'question required' }, { status: 400 });

	try {
		const result = await runAction({
			engine: body.engine === 'codex' ? 'codex' : 'claude',
			action,
			entity: body.entity,
			fileContent: body.content,
			filePath: safe,
			locked: body.locked,
			question: body.question
		});
		return json(result);
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 502 });
	}
};
