/** Longest DNS label (RFC 1035). A slug is the first label of `<slug>.atlas.local.jurrejan.com`. */
export const MAX_LABEL = 63

/**
 * Why `slug` can't be a hostname label, or null when it can: 1–63 of [a-z0-9-], no leading or
 * trailing hyphen. Every slug write is checked against this — an invalid one would fail
 * `caddy validate` on the NAS and take every later push down with it.
 */
export function slugProblem(slug: unknown): string | null {
  if (typeof slug !== 'string' || slug === '') return 'slug is empty'
  if (slug.length > MAX_LABEL) return `slug is ${slug.length} characters, max ${MAX_LABEL}`
  if (/[^a-z0-9-]/.test(slug)) return 'slug may only hold a-z, 0-9 and -'
  if (slug.startsWith('-') || slug.endsWith('-')) return 'slug may not start or end with -'
  return null
}
