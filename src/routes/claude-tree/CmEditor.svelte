<script lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { codeFolding, foldGutter, foldKeymap, syntaxHighlighting } from '@codemirror/language'
import { Annotation, Compartment } from '@codemirror/state'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { onMount } from 'svelte'
import type { Reference } from '$lib/claude-tree'
import type { Entity } from '$lib/claude-tree-entities'
import {
  activeField,
  entityClick,
  entityPlugin,
  followRef,
  refField,
  setActive,
  setRefs,
  xmlFold,
  xmlTagPlugin,
} from './cm-extensions'
import { baseTheme, highlight } from './cm-theme'

let {
  value,
  references = [],
  dark = true,
  activeRange = null,
  onChange,
  onRefClick,
  onEntityAction,
}: {
  value: string
  references?: Reference[]
  dark?: boolean
  activeRange?: { startLine: number; endLine: number } | null
  onChange: (v: string) => void
  onRefClick: (ref: Reference) => void
  onEntityAction?: (entity: Entity, pos: { x: number; y: number }) => void
} = $props()

let host: HTMLDivElement
let view: EditorView | undefined

// External edits (openFile, snapshot preview) carry this annotation so the change
// listener doesn't mistake them for user typing and mark the file dirty.
const External = Annotation.define<boolean>()
const themeComp = new Compartment()

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
      entityClick((e, pos) => onEntityAction?.(e, pos)),
      activeField,
      refField,
      followRef((ref) => onRefClick(ref)),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
      themeComp.of(baseTheme(dark)),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !u.transactions.some((t) => t.annotation(External)))
          onChange(u.state.doc.toString())
      }),
    ],
  })
  view.dispatch({ effects: setRefs.of(references) })
  return () => view?.destroy()
})

// Push external value changes (file switch, snapshot preview) into the editor.
$effect(() => {
  const v = value
  if (view && v !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: v },
      annotations: External.of(true),
    })
  }
})

// Re-decorate when the active file's references change.
$effect(() => {
  const refs = references
  if (view) view.dispatch({ effects: setRefs.of(refs) })
})

// Shade the entity whose action menu is open (cleared when it closes).
$effect(() => {
  const range = activeRange
  if (view) view.dispatch({ effects: setActive.of(range) })
})

// Keep CodeMirror's built-in dark/light defaults in sync with the app theme.
$effect(() => {
  const d = dark
  if (view) view.dispatch({ effects: themeComp.reconfigure(baseTheme(d)) })
})

/** Select + scroll a 1-based line into the center (backs the find feature's jump). */
export function jumpToLine(line: number) {
  if (!view) return
  const l = Math.max(1, Math.min(line, view.state.doc.lines))
  const pos = view.state.doc.line(l).from
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
  })
  view.focus()
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
