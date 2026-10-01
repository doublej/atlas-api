import { connect } from 'node:tls'
import type { HostnameStatus } from './types'

const POLL_MS = 2000
const WATCH_MS = 120_000
const PROBE_TIMEOUT_MS = 5000

export interface Tracked {
  state: Exclude<HostnameStatus, 'none'>
  error?: string
}

/** In memory only: a daemon restart forgets it, and the registry's `nasSynced` takes over. */
const tracked = new Map<string, Tracked>()

export const trackedState = (slug: string): Tracked | undefined => tracked.get(slug)

export function markSyncing(slug: string): void {
  tracked.set(slug, { state: 'syncing' })
}

export function markFailed(slug: string, error: string): void {
  tracked.set(slug, { state: 'failed', error })
}

export function forget(slug: string): void {
  tracked.delete(slug)
}

/**
 * Resolves true once `host:443` presents a certificate this Mac trusts for that name — the
 * NAS has the route and its certificate. Whether the dev server behind it is up is the run
 * state's business, not the hostname's.
 */
export function probeTls(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: PROBE_TIMEOUT_MS })
    const done = (ok: boolean) => {
      socket.destroy()
      resolve(ok)
    }
    socket.once('secureConnect', () => done(socket.authorized))
    socket.once('error', () => done(false))
    socket.once('timeout', () => done(false))
  })
}

/**
 * After a push: `issuing` until the name answers over valid TLS, then `live`; `failed` when it
 * still doesn't after two minutes. A newer push for the same slug supersedes this watch.
 */
export function watchLive(
  slug: string,
  host: string,
  probe: (host: string) => Promise<boolean> = probeTls,
): Promise<void> {
  const mine: Tracked = { state: 'issuing' }
  tracked.set(slug, mine)
  const deadline = Date.now() + WATCH_MS
  const settle = (next: Tracked) => {
    if (tracked.get(slug) === mine) tracked.set(slug, next)
  }
  const poll = async (): Promise<void> => {
    if (tracked.get(slug) !== mine) return
    if (await probe(host)) return settle({ state: 'live' })
    if (Date.now() >= deadline) {
      return settle({ state: 'failed', error: `${host} has no valid certificate after 2 min` })
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
    return poll()
  }
  return poll()
}
