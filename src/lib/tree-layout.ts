// Top-down dagre layout for the CLAUDE.md tree. Card width is fixed (210px);
// height is estimated from the preview so we never have to wait for a measure
// pass — fitView then pins the canvas at 1:1 (natural size, no shrink-to-fit).
import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/svelte';
import type { Preview } from '$lib/claude-tree';

export const CARD_W = 240;

/** Recommended per-file token budget. A CLAUDE.md beyond this is flagged as over-length. */
export const RECOMMENDED_TOKENS = 1500;

export function cardHeight(p: Preview): number {
	let inner = 0;
	if (p.h1) inner += 28; // title, up to 2 lines
	if (p.blurb) inner += 58; // blurb, up to 6 clamped lines (smaller font)
	if (p.sections.length) inner += 50; // sections, up to 5 lines
	if (inner === 0) inner = 16; // empty file → minimal viewport
	return 34 /* file header */ + 18 /* viewport padding */ + inner + 30 /* footer stats */;
}

export function layoutTree(nodes: Node[], edges: Edge[]): Node[] {
	const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
	g.setGraph({ rankdir: 'TB', nodesep: 90, ranksep: 120 });
	for (const n of nodes) {
		const { preview } = n.data as { preview: Preview };
		g.setNode(n.id, { width: CARD_W, height: cardHeight(preview) });
	}
	for (const e of edges) g.setEdge(e.source, e.target);
	dagre.layout(g);
	return nodes.map((n) => {
		const { x, y } = g.node(n.id);
		const { preview } = n.data as { preview: Preview };
		return { ...n, position: { x: x - CARD_W / 2, y: y - cardHeight(preview) / 2 } };
	});
}
