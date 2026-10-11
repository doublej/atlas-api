// The settings form's mapping between a project's `.atlas` and the fields it edits. Pure, so the
// page and the modal (one SettingsForm) read and write `.atlas` the same way.

export type Meta = Record<string, unknown>

export interface SettingsFields {
  description: string
  type: string
  framework: string
  slug: string
  port: number | null
  archived: boolean
  devPublic: boolean
  /** Comma- or space-separated hosts. */
  domains: string
  /** Comma- or space-separated Umami website ids. */
  umamiIds: string
  umamiInstance: string
}

/** `.atlas` keys this form owns. Anything else is shown read-only and left untouched. */
export const OWNED_KEYS = [
  'description',
  'type',
  'framework',
  'slug',
  'port',
  'archived',
  'devPublic',
  'domain',
  'domains',
  'umami',
]

const str = (v: unknown): string => (v == null ? '' : String(v))
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** The `.atlas` `umami` value in any of the shapes the scanner reads: id, ids, or an object. */
function umamiOf(v: unknown): { ids: string[]; instance: string } {
  if (typeof v === 'string') return { ids: [v], instance: '' }
  if (Array.isArray(v)) return { ids: strings(v), instance: '' }
  if (v && typeof v === 'object') {
    const o = v as { websiteIds?: unknown; instance?: unknown }
    return { ids: strings(o.websiteIds), instance: str(o.instance) }
  }
  return { ids: [], instance: '' }
}

export function fieldsFromMeta(meta: Meta): SettingsFields {
  const umami = umamiOf(meta.umami)
  const domains = [
    ...(typeof meta.domain === 'string' ? [meta.domain] : []),
    ...strings(meta.domains),
  ]
  return {
    description: str(meta.description),
    type: str(meta.type),
    framework: str(meta.framework),
    slug: str(meta.slug),
    port: typeof meta.port === 'number' ? meta.port : null,
    archived: meta.archived === true,
    devPublic: meta.devPublic === true,
    domains: domains.join(', '),
    umamiIds: umami.ids.join(', '),
    umamiInstance: umami.instance,
  }
}

/** Empty clears the override — `null` is what `PATCH /api/atlas` reads as "delete this key". */
const text = (v: string): string | null => (v.trim() === '' ? null : v.trim())

const list = (v: string): string[] | null => {
  const items = [...new Set(v.split(/[\s,]+/).filter(Boolean))]
  return items.length ? items : null
}

/** The `PATCH /api/atlas` body for these fields. `domain` folds into `domains`. */
export function patchFromFields(f: SettingsFields): Meta {
  const ids = list(f.umamiIds)
  const instance = text(f.umamiInstance)
  return {
    description: text(f.description),
    type: text(f.type),
    framework: text(f.framework),
    slug: text(f.slug),
    port: f.port,
    archived: f.archived || null,
    devPublic: f.devPublic || null,
    domain: null,
    domains: list(f.domains),
    umami: ids && instance ? { websiteIds: ids, instance } : ids,
  }
}
