/** A relativePath with `/` separators — Fractal's scan agent reports Windows backslashes. */
export const slashed = (relativePath: string): string => relativePath.replaceAll('\\', '/')

/** The project page URL: `/p/<relativePath>`, each segment encoded; `host` picks a remote twin. */
export function projectHref(relativePath: string, host?: string): string {
  const path = slashed(relativePath).split('/').map(encodeURIComponent).join('/')
  return `/p/${path}${host ? `?host=${encodeURIComponent(host)}` : ''}`
}

/** The same project on another machine, linked from its page. */
export interface Twin {
  host: string
  path: string
  href: string
}
