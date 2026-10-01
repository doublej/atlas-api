// The page's keyboard shortcuts, as data: which window keydown does what.

export type KeyAction = 'dismiss' | 'save' | 'find'

/** Escape closes every overlay; ⌘/Ctrl-S saves; ⌘/Ctrl-F opens find. Anything else is null. */
export function keyAction(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey'>): KeyAction | null {
  if (e.key === 'Escape') return 'dismiss'
  if (!(e.metaKey || e.ctrlKey)) return null
  const k = e.key.toLowerCase()
  if (k === 's') return 'save'
  if (k === 'f') return 'find'
  return null
}
