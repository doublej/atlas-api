// The file open in the editor: its text, the sha it was read at, the unsaved flag and its
// snapshot history — plus the save / revert / sync / snapshot round trips. The page decides
// *whether* to open something (the dirty guard); this only does the opening.

import type { Reference, TreeNode } from '$lib/claude-tree'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import { toast } from '$lib/toast.svelte'

/** A yes/no the page waits on (discard, overwrite, revert); one ConfirmDialog renders it. */
export interface Ask {
  title: string
  message: string
  confirmLabel: string
  run: () => unknown
}

/** One per agent-doc file present in the node's folder (CLAUDE.md / AGENTS.md). */
export type FileTab = { kind: 'claude' | 'agents'; path: string; name: string }
type Snapshot = { ts: string; sha: string; preview: string }
type Saved = { ok: boolean; sha: string }

const url = (param: string, path: string) => `/api/claude-tree?${param}=${encodeURIComponent(path)}`

/** The node's own references, one chip per target (the editor still marks every occurrence). */
export function uniqueRefs(refs: Reference[]): Reference[] {
  const seen = new Set<string>()
  return refs.filter((r) => {
    const key = r.targetPath ?? r.rawPath
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** A throwaway node for a referenced file that is not in the tree, so it can open too. */
export function fileNode(path: string): TreeNode {
  return {
    id: `ext:${path}`,
    path,
    label: path.slice(path.lastIndexOf('/') + 1),
    kind: 'descendant',
    parent: null,
    preview: { h1: '', blurb: '', sections: [], lines: 0, tokens: 0 },
    tokensAccumulated: 0,
  }
}

export class Doc {
  node = $state<TreeNode | null>(null)
  /** The file open in the editor — a node may expose CLAUDE.md + AGENTS.md tabs. */
  path = $state('')
  content = $state('')
  sha = $state('')
  dirty = $state(false)
  status = $state('')
  history = $state<Snapshot[]>([])
  /** Selected history index, '' = latest on disk. */
  snapshot = $state('')
  #ask: (q: Ask) => void
  /** Bumped per open: only the newest open may commit its read. */
  #seq = 0

  constructor(ask: (q: Ask) => void) {
    this.#ask = ask
  }

  name = $derived(this.path.slice(this.path.lastIndexOf('/') + 1))
  label = $derived(
    this.node ? (this.name ? `${this.name} · ${this.node.label}` : this.node.label) : '',
  )
  tabs = $derived.by<FileTab[]>(() => {
    const f = this.node?.files
    const out: FileTab[] = []
    if (f?.claude) out.push({ kind: 'claude', path: f.claude, name: 'CLAUDE.md' })
    if (f?.agents) out.push({ kind: 'agents', path: f.agents, name: 'AGENTS.md' })
    return out
  })
  /** CLAUDE.md → AGENTS.md is always available on a node with a CLAUDE.md. */
  canSync = $derived(!!this.node?.files?.claude)
  /** Every reference occurrence on the node's primary file (inline links in the editor). */
  inlineRefs = $derived(
    this.node && this.path === this.node.path ? (this.node.references ?? []) : [],
  )
  /** The same, deduped for the chip strip. */
  refs = $derived(uniqueRefs(this.inlineRefs))

  /**
   * Read `path` (the node's primary, or one of its tabs) into the editor. Node, path and text
   * switch together once the read lands — never the previous file's text under this path, which
   * a save would post here (and the editor starts a fresh undo history per path).
   */
  async open(node: TreeNode, path: string): Promise<void> {
    const seq = ++this.#seq
    this.dirty = false // a confirmed discard ends the old edits now, not when the read lands
    this.status = 'loading…'
    const r = await http
      .get<{ content: string; sha: string }>(url('path', path))
      .catch((e) => ({ content: '', sha: '', error: errorMessage(e) }))
    if (seq !== this.#seq) return // a newer open owns the editor
    this.node = node
    this.path = path
    this.snapshot = ''
    this.content = r.content
    this.sha = r.sha
    this.dirty = false
    this.history = []
    if ('error' in r) {
      this.status = `error: ${r.error}`
      return
    }
    this.status = `sha ${r.sha}`
    try {
      await this.loadHistory()
    } catch (e) {
      this.status = `error: ${errorMessage(e)}`
    }
  }

  close(): void {
    this.node = null
    this.path = ''
    this.dirty = false
  }

  /** A keystroke in the editor. */
  edit(content: string): void {
    this.content = content
    this.dirty = true
    this.status = 'unsaved'
  }

  async loadHistory(): Promise<void> {
    if (!this.node) return
    const path = this.path
    const h = await http.get<Snapshot[]>(url('history', path))
    if (this.path === path) this.history = h // a late answer for a file no longer open
  }

  async #saved(r: Saved): Promise<void> {
    this.sha = r.sha
    this.dirty = false
    this.status = `saved · sha ${r.sha}`
    await this.loadHistory()
  }

  /** Save against the sha it was read at; a 409 'disk changed' asks before overwriting. */
  async save(): Promise<void> {
    if (!this.node || !this.dirty) return
    const body = () => ({ op: 'save', path: this.path, content: this.content })
    try {
      await this.#saved(
        await http.post<Saved>('/api/claude-tree', { ...body(), expectedSha: this.sha }),
      )
    } catch (e) {
      const msg = errorMessage(e)
      this.status = `save failed: ${msg}`
      if (msg !== 'disk changed') return
      this.#ask({
        title: 'File changed on disk',
        message: `${this.label} changed on disk after you opened it. Overwrite it with your version?`,
        confirmLabel: 'Overwrite',
        run: async () =>
          this.#saved(await http.post<Saved>('/api/claude-tree', { ...body(), force: true })),
      })
    }
  }

  revert(): void {
    const node = this.node
    if (!node) return
    this.#ask({
      title: 'Revert to the last snapshot?',
      message: `${this.label} goes back to its last snapshot on disk.`,
      confirmLabel: 'Revert',
      run: async () => {
        try {
          // Against the sha it was read at: a 409 'disk changed' instead of overwriting a newer
          // version that no snapshot holds.
          await http.post('/api/claude-tree', {
            op: 'revert',
            path: this.path,
            expectedSha: this.sha,
          })
          await this.open(node, this.path)
        } catch (e) {
          this.status = `revert failed: ${errorMessage(e)}`
        }
      },
    })
  }

  /**
   * Copy this folder's CLAUDE.md into its sibling AGENTS.md (creating it if missing).
   * Returns the node with its new AGENTS.md tab, for the tree to pick up.
   */
  async sync(): Promise<TreeNode | null> {
    const claude = this.node?.files?.claude
    if (!claude) return null
    if (this.dirty && this.path === claude) {
      await this.save()
      // Still dirty: the save failed or waits on the overwrite dialog, and the sync would copy
      // the disk version. The user syncs again once it is saved.
      if (this.dirty) return null
    }
    try {
      const r = await http.post<Saved & { path: string }>('/api/claude-tree', {
        op: 'sync',
        path: claude,
      })
      if (!this.node) return null
      const node: TreeNode = { ...this.node, files: { ...this.node.files, agents: r.path } }
      this.node = node
      if (this.path === r.path) await this.open(node, r.path)
      toast('Synced CLAUDE.md → AGENTS.md')
      return node
    } catch (e) {
      this.status = `sync failed: ${errorMessage(e)}`
      return null
    }
  }

  /** Load the picked snapshot into the buffer as an unsaved edit ('' goes back to disk). */
  async previewSnapshot(): Promise<void> {
    if (!this.node) return
    if (this.snapshot === '') return this.open(this.node, this.path)
    try {
      const r = await http.get<{ content: string }>(
        `${url('snapshot', this.path)}&n=${this.snapshot}`,
      )
      this.content = r.content
      this.dirty = true
      this.status = `previewing snapshot #${this.snapshot} (unsaved)`
    } catch (e) {
      this.status = `snapshot failed: ${errorMessage(e)}`
    }
  }
}
