/**
 * Action results: one short line bottom-right that goes away by itself. `<Toaster />` in the root
 * layout renders them, so any page or component just calls `toast(…)`.
 */

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

export const toasts = $state<Toast[]>([])
let nextId = 0

/** Errors stay twice as long — they are the ones somebody has to read. */
export function toast(message: string, tone: Toast['tone'] = 'info'): void {
  const id = ++nextId
  toasts.push({ id, message, tone })
  setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000)
}

export function dismiss(id: number): void {
  const i = toasts.findIndex((t) => t.id === id)
  if (i !== -1) toasts.splice(i, 1)
}
