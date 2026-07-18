<script lang="ts">
	import { onMount } from 'svelte';
	import {
		EditorState,
		StateField,
		StateEffect,
		Annotation,
		Compartment,
		RangeSetBuilder,
		type Range
	} from '@codemirror/state';
	import {
		EditorView,
		keymap,
		lineNumbers,
		highlightActiveLine,
		highlightActiveLineGutter,
		Decoration,
		ViewPlugin,
		WidgetType,
		type DecorationSet
	} from '@codemirror/view';
	import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
	import { markdown } from '@codemirror/lang-markdown';
	import {
		syntaxHighlighting,
		HighlightStyle,
		codeFolding,
		foldGutter,
		foldKeymap,
		foldService
	} from '@codemirror/language';
	import { tags } from '@lezer/highlight';
	import type { Reference } from '$lib/claude-tree';
	import { parseEntities, type Entity } from '$lib/claude-tree-entities';

	let {
		value,
		references = [],
		dark = true,
		activeRange = null,
		onChange,
		onRefClick,
		onEntityAction
	}: {
		value: string;
		references?: Reference[];
		dark?: boolean;
		activeRange?: { startLine: number; endLine: number } | null;
		onChange: (v: string) => void;
		onRefClick: (ref: Reference) => void;
		onEntityAction?: (entity: Entity, pos: { x: number; y: number }) => void;
	} = $props();

	let host: HTMLDivElement;
	let view: EditorView | undefined;

	// External edits (openFile, snapshot preview) carry this annotation so the change
	// listener doesn't mistake them for user typing and mark the file dirty.
	const External = Annotation.define<boolean>();

	// ---- inline reference links: a StateField holding the live refs + their decorations ----
	const setRefs = StateEffect.define<Reference[]>();

	function buildRefDeco(state: EditorState, refs: Reference[]): DecorationSet {
		const doc = state.doc;
		const marks: { from: number; to: number; idx: number }[] = [];
		refs.forEach((r, idx) => {
			if (r.line < 1 || r.line > doc.lines) return;
			const line = doc.line(r.line);
			const col = line.text.indexOf(r.rawPath);
			if (col < 0) return;
			marks.push({ from: line.from + col, to: line.from + col + r.rawPath.length, idx });
		});
		marks.sort((a, b) => a.from - b.from || a.to - b.to);
		const b = new RangeSetBuilder<Decoration>();
		let lastTo = -1;
		for (const m of marks) {
			if (m.from < lastTo) continue; // skip overlaps (RangeSetBuilder needs ordered, non-overlapping)
			const r = refs[m.idx];
			b.add(
				m.from,
				m.to,
				Decoration.mark({
					class: 'cm-ref-link' + (r.targetPath ? '' : ' cm-ref-dead'),
					attributes: {
						'data-ref': String(m.idx),
						title: (r.targetPath ?? r.rawPath) + (r.targetPath ? ' · ⌘/Ctrl-click to open' : '')
					}
				})
			);
			lastTo = m.to;
		}
		return b.finish();
	}

	const refField = StateField.define<{ refs: Reference[]; deco: DecorationSet }>({
		create() {
			return { refs: [], deco: Decoration.none };
		},
		update(val, tr) {
			let refs = val.refs;
			for (const e of tr.effects) if (e.is(setRefs)) refs = e.value;
			if (tr.docChanged || refs !== val.refs) return { refs, deco: buildRefDeco(tr.state, refs) };
			return val;
		},
		provide: (f) => EditorView.decorations.from(f, (v) => v.deco)
	});

	// ---- XML tag highlighting: decorate <tag>, </tag>, <tag/> in the visible range ----
	const tagMark = Decoration.mark({ class: 'cm-xml-tag' });
	const xmlTagPlugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			constructor(v: EditorView) {
				this.decorations = this.build(v);
			}
			update(u: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
				if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
			}
			build(v: EditorView): DecorationSet {
				const b = new RangeSetBuilder<Decoration>();
				const re = /<\/?[A-Za-z][\w:-]*(?:\s[^>]*)?\/?>/g;
				for (const { from, to } of v.visibleRanges) {
					const text = v.state.doc.sliceString(from, to);
					let m: RegExpExecArray | null;
					while ((m = re.exec(text))) b.add(from + m.index, from + m.index + m[0].length, tagMark);
				}
				return b.finish();
			}
		},
		{ decorations: (v) => v.decorations }
	);

	// ---- folding: collapse a line that is just an opening <tag> down to its </tag> ----
	function matchingClose(doc: EditorState['doc'], openLine: number, tag: string): number | null {
		const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'g');
		const closeRe = new RegExp(`</${tag}>`, 'g');
		let depth = 0;
		for (let i = openLine; i <= doc.lines; i++) {
			const text = doc.line(i).text;
			depth += (text.match(openRe) || []).length - (text.match(closeRe) || []).length;
			if (i > openLine && depth <= 0) return i;
		}
		return null;
	}

	const xmlFold = foldService.of((state, lineStart) => {
		const line = state.doc.lineAt(lineStart);
		const m = /^<([A-Za-z][\w:-]*)(?:\s[^>]*)?>\s*$/.exec(line.text.trim());
		if (!m) return null;
		const close = matchingClose(state.doc, line.number, m[1]);
		if (close === null || close === line.number) return null;
		return { from: line.to, to: state.doc.line(close).to };
	});

	// ---- entity actions: a hover-revealed ✦ affordance on every non-blank line ----
	// (Click → onEntityAction with the entity and the affordance's screen position.)
	class EntityActionWidget extends WidgetType {
		id: string;
		constructor(id: string) {
			super();
			this.id = id;
		}
		eq(other: EntityActionWidget) {
			return other.id === this.id;
		}
		toDOM() {
			const el = document.createElement('span');
			el.className = 'cm-entity-action';
			el.dataset.entityId = this.id;
			el.textContent = '✦';
			el.setAttribute('title', 'AI actions for this item');
			el.setAttribute('aria-label', 'AI actions for this item');
			return el;
		}
		ignoreEvent() {
			return false; // let our mousedown handler see the click
		}
	}

	function buildEntityDeco(entities: Entity[], doc: EditorState['doc']): DecorationSet {
		const ranges: Range<Decoration>[] = [];
		for (const e of entities) {
			if (e.anchorLine < 1 || e.anchorLine > doc.lines) continue;
			const line = doc.line(e.anchorLine);
			ranges.push(Decoration.line({ class: 'cm-entity-line' }).range(line.from));
			ranges.push(Decoration.widget({ widget: new EntityActionWidget(e.id), side: 1 }).range(line.to));
		}
		return Decoration.set(ranges, true);
	}

	const entityPlugin = ViewPlugin.fromClass(
		class {
			entities: Entity[];
			decorations: DecorationSet;
			constructor(v: EditorView) {
				this.entities = parseEntities(v.state.doc.toString());
				this.decorations = buildEntityDeco(this.entities, v.state.doc);
			}
			update(u: { docChanged: boolean; state: EditorState }) {
				if (!u.docChanged) return;
				this.entities = parseEntities(u.state.doc.toString());
				this.decorations = buildEntityDeco(this.entities, u.state.doc);
			}
		},
		{ decorations: (v) => v.decorations }
	);

	const entityClick = EditorView.domEventHandlers({
		mousedown(event, v) {
			const el = (event.target as HTMLElement | null)?.closest('.cm-entity-action') as HTMLElement | null;
			const id = el?.dataset.entityId;
			if (!id) return false;
			const ent = v.plugin(entityPlugin)?.entities.find((e) => e.id === id);
			if (!ent) return false;
			event.preventDefault();
			const r = el!.getBoundingClientRect();
			onEntityAction?.(ent, { x: r.left, y: r.bottom + 4 });
			return true;
		}
	});

	// ---- active highlight: shade every line of the entity whose menu is open ----
	type LineRange = { startLine: number; endLine: number };
	const setActive = StateEffect.define<LineRange | null>();

	function activeDeco(range: LineRange | null, doc: EditorState['doc']): DecorationSet {
		if (!range) return Decoration.none;
		const ranges: Range<Decoration>[] = [];
		const last = Math.min(range.endLine, doc.lines);
		for (let ln = Math.max(1, range.startLine); ln <= last; ln++) {
			ranges.push(Decoration.line({ class: 'cm-entity-active' }).range(doc.line(ln).from));
		}
		return Decoration.set(ranges, true);
	}

	const activeField = StateField.define<DecorationSet>({
		create() {
			return Decoration.none;
		},
		update(deco, tr) {
			for (const e of tr.effects) if (e.is(setActive)) return activeDeco(e.value, tr.state.doc);
			return tr.docChanged ? deco.map(tr.changes) : deco;
		},
		provide: (f) => EditorView.decorations.from(f)
	});

	// ---- highlight + theme (colors come from global design tokens, so they flip with .dark) ----
	const highlight = HighlightStyle.define([
		{ tag: tags.heading, color: 'var(--color-fg)', fontWeight: '600' },
		{ tag: tags.strong, fontWeight: '600' },
		{ tag: tags.emphasis, fontStyle: 'italic' },
		{ tag: tags.link, color: 'var(--color-accent)' },
		{ tag: tags.url, color: 'var(--color-accent)' },
		{ tag: [tags.monospace, tags.tagName, tags.angleBracket, tags.attributeName], color: 'var(--color-info)' },
		{ tag: tags.comment, color: 'var(--color-muted)' },
		{ tag: tags.quote, color: 'var(--color-muted)' }
	]);

	const themeComp = new Compartment();
	const baseTheme = (isDark: boolean) =>
		EditorView.theme(
			{
				'&': { backgroundColor: 'var(--color-bg)', color: 'var(--color-fg)', height: '100%' },
				'.cm-content': { fontFamily: 'var(--font-mono)', fontSize: '13px', padding: '12px 0' },
				'.cm-scroller': { lineHeight: '1.65', overflow: 'auto' },
				'.cm-gutters': {
					backgroundColor: 'var(--color-bg)',
					color: 'var(--color-muted-2)',
					border: 'none'
				},
				'.cm-activeLine': { backgroundColor: 'var(--color-card-2)' },
				'.cm-activeLineGutter': { backgroundColor: 'var(--color-card-2)' },
				'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
					backgroundColor: 'var(--color-accent-soft)'
				},
				'.cm-cursor': { borderLeftColor: 'var(--color-fg)' },
				'.cm-foldPlaceholder': {
					backgroundColor: 'var(--color-card-2)',
					color: 'var(--color-muted)',
					border: '1px solid var(--color-border)',
					borderRadius: '4px',
					margin: '0 4px',
					padding: '0 6px'
				},
				'.cm-xml-tag': { color: 'var(--color-info)' },
				'.cm-ref-link': {
					color: 'var(--color-accent)',
					textDecoration: 'underline',
					textDecorationStyle: 'dotted',
					textUnderlineOffset: '2px'
				},
				'.cm-ref-link.cm-ref-dead': { color: 'var(--color-muted)', textDecoration: 'none' },
				'.cm-entity-action': {
					cursor: 'pointer',
					marginLeft: '10px',
					padding: '1px 7px',
					borderRadius: '6px',
					fontSize: '1.05em',
					lineHeight: '1',
					color: 'var(--color-accent)',
					background: 'var(--color-accent-soft)',
					border: '1px solid var(--color-accent-soft)',
					opacity: '0',
					userSelect: 'none',
					transition: 'opacity 120ms ease, transform 120ms ease'
				},
				'.cm-entity-line:hover .cm-entity-action': { opacity: '0.7' },
				'.cm-entity-action:hover': {
					opacity: '1',
					transform: 'scale(1.12)',
					borderColor: 'var(--color-accent)'
				},
				// While its menu is open, an entity's whole range is highlighted (the full section/block).
				'.cm-entity-active': { backgroundColor: 'var(--color-accent-soft)' },
				'.cm-entity-active .cm-entity-action': { opacity: '1' }
			},
			{ dark: isDark }
		);

	const followRef = EditorView.domEventHandlers({
		mousedown(event, v) {
			if (!(event.metaKey || event.ctrlKey)) return false;
			const el = (event.target as HTMLElement | null)?.closest('.cm-ref-link') as HTMLElement | null;
			const attr = el?.getAttribute('data-ref');
			if (attr == null) return false;
			const ref = v.state.field(refField).refs[Number(attr)];
			if (!ref) return false;
			event.preventDefault();
			onRefClick(ref);
			return true;
		}
	});

	onMount(() => {
		view = new EditorView({
			doc: value,
			parent: host,
			extensions: [
				lineNumbers(),
				highlightActiveLine(),
				highlightActiveLineGutter(),
				history(),
				codeFolding(),
				foldGutter(),
				xmlFold,
				markdown(),
				syntaxHighlighting(highlight),
				xmlTagPlugin,
				entityPlugin,
				entityClick,
				activeField,
				refField,
				followRef,
				EditorView.lineWrapping,
				keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
				themeComp.of(baseTheme(dark)),
				EditorView.updateListener.of((u) => {
					if (u.docChanged && !u.transactions.some((t) => t.annotation(External)))
						onChange(u.state.doc.toString());
				})
			]
		});
		view.dispatch({ effects: setRefs.of(references) });
		return () => view?.destroy();
	});

	// Push external value changes (file switch, snapshot preview) into the editor.
	$effect(() => {
		const v = value;
		if (view && v !== view.state.doc.toString()) {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: v },
				annotations: External.of(true)
			});
		}
	});

	// Re-decorate when the active file's references change.
	$effect(() => {
		const refs = references;
		if (view) view.dispatch({ effects: setRefs.of(refs) });
	});

	// Shade the entity whose action menu is open (cleared when it closes).
	$effect(() => {
		const range = activeRange;
		if (view) view.dispatch({ effects: setActive.of(range) });
	});

	// Keep CodeMirror's built-in dark/light defaults in sync with the app theme.
	$effect(() => {
		const d = dark;
		if (view) view.dispatch({ effects: themeComp.reconfigure(baseTheme(d)) });
	});

	/** Select + scroll a 1-based line into the center (backs the find feature's jump). */
	export function jumpToLine(line: number) {
		if (!view) return;
		const l = Math.max(1, Math.min(line, view.state.doc.lines));
		const pos = view.state.doc.line(l).from;
		view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
		view.focus();
	}
</script>

<div class="cm-host" bind:this={host}></div>

<style>
	.cm-host {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
	.cm-host :global(.cm-editor) {
		height: 100%;
	}
	.cm-host :global(.cm-editor.cm-focused) {
		outline: none;
	}
</style>
