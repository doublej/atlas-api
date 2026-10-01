// The hostname wire shapes (contracts.md C.2), shared by the API routes, the console and the CLI.

export type HostnameStatus = 'none' | 'syncing' | 'issuing' | 'live' | 'failed'

export interface HostnameState {
  slug: string
  /** https://<slug>.atlas.local.jurrejan.com (a service's own short host when it has one). */
  local: string
  /** null when no remote block exists: devPublic-less without CADDY_DEV_AUTH_HASH, or turned off. */
  remote: string | null
  state: HostnameStatus
  nasSynced: boolean
  error?: string
}

/** Who already holds a slug. */
export interface Holder {
  kind: 'project' | 'service'
  name: string
  path?: string
}

/** A registry row as `GET /api/hostnames` lists it. */
export interface HostnameRow extends HostnameState {
  path?: string
  service?: true
}

export type SlugCheck = {
  slug: string
  status: 'free' | 'current' | 'taken' | 'invalid'
  reason?: string
  holder?: Holder
  local: string
  remote: string | null
}

export interface DriftItem {
  /** Stable across runs: `<kind>:<slug|path|file>`. */
  id: string
  kind: string
  slug?: string
  path?: string
  detail: string
  /** null = report only (needs JJ, or nothing atlas may change). */
  fix: { label: string } | null
}

/** What the project row's chip needs, keyed by project path in the "/" page data. */
export type HostnameChipData = Pick<HostnameState, 'slug' | 'local' | 'state'>
