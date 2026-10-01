// CodeMirror extensions for the CLAUDE.md editor: inline reference links, XML tag
// highlighting and folding, the ✦ entity-action affordance and the active-entity shade.
// The two click handlers take their callback so the component can pass its live props.

import { foldService } from '@codemirror/language'
import {
  type EditorState,
  type Range,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view'
import type { Reference } from '$lib/claude-tree'
import { type Entity, parseEntities } from '$lib/claude-tree-entities'

// ---- inline reference links: a StateField holding the live refs + their decorations ----
export const setRefs = StateEffect.define<Reference[]>()

function buildRefDeco(state: EditorState, refs: Reference[]): DecorationSet {
  const doc = state.doc
  const marks: { from: number; to: number; idx: number }[] = []
  refs.forEach((r, idx) => {
    if (r.line < 1 || r.line > doc.lines) return
    const line = doc.line(r.line)
    const col = line.text.indexOf(r.rawPath)
    if (col < 0) return
    marks.push({ from: line.from + col, to: line.from + col + r.rawPath.length, idx })
  })
  marks.sort((a, b) => a.from - b.from || a.to - b.to)
  const b = new RangeSetBuilder<Decoration>()
  let lastTo = -1
  for (const m of marks) {
    if (m.from < lastTo) continue // skip overlaps (RangeSetBuilder needs ordered, non-overlapping)
    const r = refs[m.idx]
    b.add(
      m.from,
      m.to,
      Decoration.mark({
        class: 'cm-ref-link' + (r.targetPath ? '' : ' cm-ref-dead'),
        attributes: {
          'data-ref': String(m.idx),
          title: (r.targetPath ?? r.rawPath) + (r.targetPath ? ' · ⌘/Ctrl-click to open' : ''),
        },
      }),
    )
    lastTo = m.to
  }
  return b.finish()
}

export const refField = StateField.define<{ refs: Reference[]; deco: DecorationSet }>({
  create() {
    return { refs: [], deco: Decoration.none }
  },
  update(val, tr) {
    let refs = val.refs
    for (const e of tr.effects) if (e.is(setRefs)) refs = e.value
    if (tr.docChanged || refs !== val.refs) return { refs, deco: buildRefDeco(tr.state, refs) }
    return val
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
})

// ---- XML tag highlighting: decorate <tag>, </tag>, <tag/> in the visible range ----
const tagMark = Decoration.mark({ class: 'cm-xml-tag' })
export const xmlTagPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(v: EditorView) {
      this.decorations = this.build(v)
    }
    update(u: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view)
    }
    build(v: EditorView): DecorationSet {
      const b = new RangeSetBuilder<Decoration>()
      const re = /<\/?[A-Za-z][\w:-]*(?:\s[^>]*)?\/?>/g
      for (const { from, to } of v.visibleRanges) {
        const text = v.state.doc.sliceString(from, to)
        let m: RegExpExecArray | null
        while ((m = re.exec(text))) b.add(from + m.index, from + m.index + m[0].length, tagMark)
      }
      return b.finish()
    }
  },
  { decorations: (v) => v.decorations },
)

// ---- folding: collapse a line that is just an opening <tag> down to its </tag> ----
function matchingClose(doc: EditorState['doc'], openLine: number, tag: string): number | null {
  const openRe = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'g')
  const closeRe = new RegExp(`</${tag}>`, 'g')
  let depth = 0
  for (let i = openLine; i <= doc.lines; i++) {
    const text = doc.line(i).text
    depth += (text.match(openRe) || []).length - (text.match(closeRe) || []).length
    if (i > openLine && depth <= 0) return i
  }
  return null
}

export const xmlFold = foldService.of((state, lineStart) => {
  const line = state.doc.lineAt(lineStart)
  const m = /^<([A-Za-z][\w:-]*)(?:\s[^>]*)?>\s*$/.exec(line.text.trim())
  if (!m) return null
  const close = matchingClose(state.doc, line.number, m[1])
  if (close === null || close === line.number) return null
  return { from: line.to, to: state.doc.line(close).to }
})

// ---- entity actions: a hover-revealed ✦ affordance on every non-blank line ----
// (Click → onEntityAction with the entity and the affordance's screen position.)
class EntityActionWidget extends WidgetType {
  id: string
  constructor(id: string) {
    super()
    this.id = id
  }
  eq(other: EntityActionWidget) {
    return other.id === this.id
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-entity-action'
    el.dataset.entityId = this.id
    el.textContent = '✦'
    el.setAttribute('title', 'AI actions for this item')
    el.setAttribute('aria-label', 'AI actions for this item')
    return el
  }
  ignoreEvent() {
    return false // let our mousedown handler see the click
  }
}

function buildEntityDeco(entities: Entity[], doc: EditorState['doc']): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const e of entities) {
    if (e.anchorLine < 1 || e.anchorLine > doc.lines) continue
    const line = doc.line(e.anchorLine)
    ranges.push(Decoration.line({ class: 'cm-entity-line' }).range(line.from))
    ranges.push(Decoration.widget({ widget: new EntityActionWidget(e.id), side: 1 }).range(line.to))
  }
  return Decoration.set(ranges, true)
}

export const entityPlugin = ViewPlugin.fromClass(
  class {
    entities: Entity[]
    decorations: DecorationSet
    constructor(v: EditorView) {
      this.entities = parseEntities(v.state.doc.toString())
      this.decorations = buildEntityDeco(this.entities, v.state.doc)
    }
    update(u: { docChanged: boolean; state: EditorState }) {
      if (!u.docChanged) return
      this.entities = parseEntities(u.state.doc.toString())
      this.decorations = buildEntityDeco(this.entities, u.state.doc)
    }
  },
  { decorations: (v) => v.decorations },
)

/** Click on a ✦ → `onEntityAction` with the entity and the affordance's screen position. */
export const entityClick = (
  onEntityAction: (entity: Entity, pos: { x: number; y: number }) => void,
) =>
  EditorView.domEventHandlers({
    mousedown(event, v) {
      const el = (event.target as HTMLElement | null)?.closest(
        '.cm-entity-action',
      ) as HTMLElement | null
      const id = el?.dataset.entityId
      if (!el || !id) return false
      const ent = v.plugin(entityPlugin)?.entities.find((e) => e.id === id)
      if (!ent) return false
      event.preventDefault()
      const r = el.getBoundingClientRect()
      onEntityAction(ent, { x: r.left, y: r.bottom + 4 })
      return true
    },
  })

// ---- active highlight: shade every line of the entity whose menu is open ----
type LineRange = { startLine: number; endLine: number }
export const setActive = StateEffect.define<LineRange | null>()

function activeDeco(range: LineRange | null, doc: EditorState['doc']): DecorationSet {
  if (!range) return Decoration.none
  const ranges: Range<Decoration>[] = []
  const last = Math.min(range.endLine, doc.lines)
  for (let ln = Math.max(1, range.startLine); ln <= last; ln++) {
    ranges.push(Decoration.line({ class: 'cm-entity-active' }).range(doc.line(ln).from))
  }
  return Decoration.set(ranges, true)
}

export const activeField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none
  },
  update(deco, tr) {
    for (const e of tr.effects) if (e.is(setActive)) return activeDeco(e.value, tr.state.doc)
    return tr.docChanged ? deco.map(tr.changes) : deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

/** ⌘/Ctrl-click on an inline reference link → `onRefClick`. */
export const followRef = (onRefClick: (ref: Reference) => void) =>
  EditorView.domEventHandlers({
    mousedown(event, v) {
      if (!(event.metaKey || event.ctrlKey)) return false
      const el = (event.target as HTMLElement | null)?.closest('.cm-ref-link') as HTMLElement | null
      const attr = el?.getAttribute('data-ref')
      if (attr == null) return false
      const ref = v.state.field(refField).refs[Number(attr)]
      if (!ref) return false
      event.preventDefault()
      onRefClick(ref)
      return true
    },
  })
