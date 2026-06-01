// Markdown entity detection for the CLAUDE.md editor: every heading (a section)
// and every list item (a bullet) becomes an addressable entity with a line range,
// so the editor can offer per-item agent actions. Pure + framework-free — imported
// client-side by CmEditor and (for validation) server-side by the agent endpoint.

export type EntityKind = 'section' | 'bullet';

export interface Entity {
	id: string; // stable within one parse — `${kind}:${anchorLine}`
	kind: EntityKind;
	anchorLine: number; // 1-based line of the heading / bullet marker
	startLine: number; // 1-based, inclusive (== anchorLine)
	endLine: number; // 1-based, inclusive — last line owned by this entity
	level: number; // heading depth (1–6); bullet indent depth (spaces) for bullets
	title: string; // short label for the action menu
	text: string; // the entity's full source text (startLine..endLine)
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.+)/;
const FENCE = /^\s*(```|~~~)/;
const TITLE_MAX = 64;

const leadingSpaces = (line: string): number => line.length - line.trimStart().length;

const clip = (s: string): string => (s.length > TITLE_MAX ? s.slice(0, TITLE_MAX - 1) + '…' : s);

/** Per-line flag: true when the line sits inside a fenced code block (``` or ~~~). */
function fencedLines(lines: string[]): boolean[] {
	const flags = new Array<boolean>(lines.length).fill(false);
	let open = false;
	for (let i = 0; i < lines.length; i++) {
		if (FENCE.test(lines[i])) {
			flags[i] = true; // the fence line itself is part of the block
			open = !open;
		} else {
			flags[i] = open;
		}
	}
	return flags;
}

/** First line index of the body (skips a leading `---` YAML frontmatter block). */
function bodyStart(lines: string[]): number {
	if (lines[0]?.trim() !== '---') return 0;
	for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') return i + 1;
	return 0; // unterminated — treat the whole file as body
}

/** Last line a section owns: up to (not including) the next heading of equal-or-higher rank. */
function sectionEnd(lines: string[], fenced: boolean[], start: number, level: number): number {
	for (let i = start + 1; i < lines.length; i++) {
		if (fenced[i]) continue;
		const m = HEADING.exec(lines[i]);
		if (m && m[1].length <= level) return i; // 0-based line before this heading
	}
	return lines.length;
}

/** Last line a bullet owns: trailing wrapped/nested lines indented past the marker. */
function bulletEnd(lines: string[], fenced: boolean[], start: number, indent: number): number {
	let end = start;
	for (let i = start + 1; i < lines.length; i++) {
		if (lines[i].trim() === '') continue; // tentative — trailing blanks stay excluded
		if (!fenced[i] && leadingSpaces(lines[i]) <= indent) break; // a sibling/parent ends it
		end = i;
	}
	return end;
}

function sliceText(lines: string[], startIdx: number, endIdx: number): string {
	return lines.slice(startIdx, endIdx + 1).join('\n');
}

/** Detect every section and bullet as an addressable entity, in document order. */
export function parseEntities(text: string): Entity[] {
	const lines = text.split('\n');
	const fenced = fencedLines(lines);
	const start = bodyStart(lines);
	const out: Entity[] = [];
	for (let i = start; i < lines.length; i++) {
		if (fenced[i]) continue;
		const h = HEADING.exec(lines[i]);
		if (h) {
			const endIdx = sectionEnd(lines, fenced, i, h[1].length) - 1;
			out.push(makeEntity('section', i, endIdx, h[1].length, h[2].trim(), lines));
			continue;
		}
		const b = BULLET.exec(lines[i]);
		if (b) {
			const indent = b[1].length;
			const endIdx = bulletEnd(lines, fenced, i, indent);
			out.push(makeEntity('bullet', i, endIdx, indent, b[2].trim(), lines));
		}
	}
	return out;
}

function makeEntity(
	kind: EntityKind,
	startIdx: number,
	endIdx: number,
	level: number,
	rawTitle: string,
	lines: string[]
): Entity {
	const anchor = startIdx + 1;
	return {
		id: `${kind}:${anchor}`,
		kind,
		anchorLine: anchor,
		startLine: anchor,
		endLine: endIdx + 1,
		level,
		title: clip(rawTitle),
		text: sliceText(lines, startIdx, endIdx)
	};
}

/** Splice a replacement into `text` over the 1-based inclusive line range, trimming trailing blanks. */
export function replaceLines(text: string, startLine: number, endLine: number, replacement: string): string {
	const lines = text.split('\n');
	const before = lines.slice(0, startLine - 1);
	const after = lines.slice(endLine);
	const repl = replacement.replace(/\s+$/, '').split('\n');
	return [...before, ...repl, ...after].join('\n');
}
