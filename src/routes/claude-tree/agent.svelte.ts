// Per-entity agent actions: a hover affordance opens the menu over a heading/bullet (or the
// whole file), the chosen action runs Claude or Codex, and the reply edits the buffer or
// opens the answer panel.

import { type AgentEngine, getAction } from '$lib/claude-tree-actions'
import { type Entity, replaceLines } from '$lib/claude-tree-entities'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import { toast } from '$lib/toast.svelte'
import type { Doc } from './doc.svelte'

type AgentResult = { kind: 'edit' | 'answer'; text: string; engine: AgentEngine }
export type RunRequest = { actionId: string; locked: boolean; question?: string }

/** The whole buffer as one entity — backs the file-level AI button. */
export function fileEntity(content: string, title: string): Entity {
  return {
    id: 'file',
    kind: 'file',
    anchorLine: 1,
    startLine: 1,
    endLine: content.split('\n').length,
    level: 0,
    title,
    text: content,
  }
}

export class AgentActions {
  engine = $state<AgentEngine>('claude')
  menu = $state<{ entity: Entity; pos: { x: number; y: number } } | null>(null)
  busy = $state(false)
  panel = $state<{ title: string; busy: boolean; text: string; error: string | null } | null>(null)
  /** The lines the open menu is about, shaded in the editor. */
  range = $derived(
    this.menu ? { startLine: this.menu.entity.startLine, endLine: this.menu.entity.endLine } : null,
  )
  #doc: Doc

  constructor(doc: Doc) {
    this.#doc = doc
  }

  open(entity: Entity, pos: { x: number; y: number }): void {
    this.panel = null
    this.menu = { entity, pos }
  }

  /** The header's AI button: the menu for the whole file, under the button. */
  openFile(event: MouseEvent): void {
    const doc = this.#doc
    if (!doc.node) return
    event.stopPropagation() // don't let the global close-on-outside-click see this click
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect()
    this.open(fileEntity(doc.content, doc.name || doc.node.label), { x: r.left, y: r.bottom + 4 })
  }

  dismiss(): void {
    this.menu = null
    this.panel = null
  }

  /** Run the chosen action against the current buffer; edits splice in, answers open the panel. */
  async run(p: RunRequest): Promise<void> {
    const doc = this.#doc
    const action = getAction(p.actionId)
    if (!doc.node || !this.menu || !action) return
    const entity = this.menu.entity
    const title = `${action.label} · ${entity.title}`
    this.busy = true
    if (action.mode === 'answer') {
      this.panel = { title, busy: true, text: '', error: null }
      this.menu = null
    }
    try {
      const res = await http.post<AgentResult>('/api/claude-tree/agent', {
        path: doc.path,
        content: doc.content,
        engine: this.engine,
        ...p,
        entity: {
          text: entity.text,
          startLine: entity.startLine,
          endLine: entity.endLine,
          kind: entity.kind,
        },
      })
      if (res.kind === 'answer') this.panel = { title, busy: false, text: res.text, error: null }
      else this.#apply(entity, res, p.locked, action.label)
    } catch (e) {
      const msg = errorMessage(e)
      if (action.mode === 'answer') this.panel = { title, busy: false, text: '', error: msg }
      else toast(`Agent failed: ${msg}`, 'error')
      doc.status = `agent failed: ${msg}`
    } finally {
      this.busy = false
    }
  }

  /** Replace just the item (locked) or the whole file (free), then mark the buffer dirty. */
  #apply(entity: Entity, res: AgentResult, locked: boolean, label: string): void {
    const doc = this.#doc
    doc.content = locked
      ? replaceLines(doc.content, entity.startLine, entity.endLine, res.text)
      : res.text
    doc.dirty = true
    doc.status = `${label} via ${res.engine} · unsaved`
    this.menu = null
    toast(`${label} applied — review & Save`)
  }
}
