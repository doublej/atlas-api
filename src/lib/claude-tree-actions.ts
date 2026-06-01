// The agent action registry + prompt assembly for the CLAUDE.md editor. Pure
// string logic, no SDK/node imports, so both the client menu (labels/ids/mode)
// and the server runner (instructions/prompts) read from this single source.

import type { Entity } from './claude-tree-entities';

export type AgentEngine = 'claude' | 'codex';
export type ActionMode = 'edit' | 'answer';

export interface AgentAction {
	id: string;
	label: string;
	mode: ActionMode; // 'edit' rewrites the buffer; 'answer' returns prose to read
	icon: string;
	needsInput?: boolean; // 'ask' collects a free-text question first
	instruction: string; // the task line handed to the agent ({question} for ask)
}

export const ENTITY_ACTIONS: AgentAction[] = [
	{
		id: 'explain',
		label: 'Explain',
		mode: 'answer',
		icon: '?',
		instruction:
			'Explain what this item means, why it likely exists, and how to follow it correctly. Be concise.'
	},
	{
		id: 'stricter',
		label: 'Make stricter',
		mode: 'edit',
		icon: '!',
		instruction:
			'Rewrite this item to be stricter, more precise, and less ambiguous, without changing its intent.'
	},
	{
		id: 'shorten',
		label: 'Shorten',
		mode: 'edit',
		icon: '⤓',
		instruction:
			'Rewrite this item to be as short and scannable as possible while preserving its full meaning.'
	},
	{
		id: 'clarify',
		label: 'Clarify',
		mode: 'edit',
		icon: '✎',
		instruction: 'Rewrite this item to be clearer and easier to follow, resolving any vague wording.'
	},
	{
		id: 'ask',
		label: 'Ask a question…',
		mode: 'answer',
		icon: '✶',
		needsInput: true,
		instruction: 'Answer this question about the selected item: {question}'
	}
];

export const getAction = (id: string): AgentAction | undefined => ENTITY_ACTIONS.find((a) => a.id === id);

// Sentinels fence the rewritten text so a chatty model's preamble never leaks into the file.
const OPEN = '<<<ATLAS_RESULT>>>';
const CLOSE = '<<<END_ATLAS_RESULT>>>';

const SYSTEM_EDIT =
	'You edit CLAUDE.md instruction files for AI coding agents. You return ONLY the rewritten ' +
	`markdown, fenced exactly between ${OPEN} and ${CLOSE} on their own lines — no preamble, no ` +
	'explanation, no code fences. Preserve the original markdown structure: same heading level, ' +
	'bullet marker, and indentation.';

const SYSTEM_ANSWER =
	'You answer questions about CLAUDE.md instruction files for AI coding agents. Respond in ' +
	'concise markdown. Do not rewrite or output the file.';

export interface PromptParams {
	action: AgentAction;
	entity: Pick<Entity, 'text' | 'startLine' | 'endLine' | 'kind'>;
	fileContent: string;
	filePath: string;
	locked: boolean; // true → change only this item; false → free to revise the whole file
	question?: string;
}

const task = (action: AgentAction, question?: string): string =>
	action.needsInput ? action.instruction.replace('{question}', (question ?? '').trim()) : action.instruction;

function scopeNote(locked: boolean): string {
	if (locked)
		return `Scope: rewrite ONLY the selected item. Output its replacement, fenced between ${OPEN} and ${CLOSE}.`;
	return (
		'Scope: focus on the selected item, but you may revise the rest of the file where it improves ' +
		`clarity or consistency. Output the COMPLETE updated file, fenced between ${OPEN} and ${CLOSE}.`
	);
}

/** Assemble the {system, user} prompt: full file context + the targeted item + the task. */
export function buildPrompt(p: PromptParams): { system: string; user: string } {
	const lines = [
		`File: ${p.filePath}`,
		'',
		'Full CLAUDE.md for context:',
		'```markdown',
		p.fileContent,
		'```',
		'',
		`Selected ${p.entity.kind} (lines ${p.entity.startLine}–${p.entity.endLine}):`,
		'```markdown',
		p.entity.text,
		'```',
		'',
		`Task: ${task(p.action, p.question)}`
	];
	if (p.action.mode === 'edit') lines.push(scopeNote(p.locked));
	return { system: p.action.mode === 'edit' ? SYSTEM_EDIT : SYSTEM_ANSWER, user: lines.join('\n') };
}

/** Pull the fenced rewrite out of a model reply; fall back to stripping stray code fences. */
export function extractResult(raw: string): string {
	const open = raw.indexOf(OPEN);
	const close = raw.lastIndexOf(CLOSE);
	if (open !== -1 && close > open) return raw.slice(open + OPEN.length, close).trim();
	return raw
		.trim()
		.replace(/^```[a-z]*\n?/i, '')
		.replace(/\n?```$/, '')
		.trim();
}
