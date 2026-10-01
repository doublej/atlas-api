import type { HostnameChipData, HostnameState } from '$lib/hostnames/types'

/**
 * Hostnames the settings dialog changed since the page loaded, keyed by project path (`null` =
 * released). The row chips read this before the page data, so a save shows without a reload.
 */
export const chips = $state<Record<string, HostnameChipData | null>>({})

export function setChip(path: string, h: HostnameState | null): void {
  chips[path] = h && h.state !== 'none' ? { slug: h.slug, local: h.local, state: h.state } : null
}

export const hostOf = (url: string): string => url.replace(/^https?:\/\//, '')

/** Why `port` can't be a dev port, or null (an empty field is fine: the first run allocates one). */
export function portProblem(port: number | null): string | null {
  if (port == null) return null
  return Number.isInteger(port) && port >= 1024 && port <= 65535
    ? null
    : 'a whole number from 1024 to 65535'
}
