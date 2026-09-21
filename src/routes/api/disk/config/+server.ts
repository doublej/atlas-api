import { error, json } from '@sveltejs/kit'
import { checkArgs, type DiskResult, diskJson, requireLocalRequest } from '$lib/disk'
import type { RequestHandler } from './$types'

/** The CLI's `config set` syntax: lists are comma-joined, null is `null`. */
const asArg = (v: unknown) => (Array.isArray(v) ? v.join(',') : v === null ? 'null' : String(v))

/** `{ changes: { key: value } }` → one `atlas disk config set` per key, in order; stops at the first error. */
export const PUT: RequestHandler = async ({ request }) => {
  requireLocalRequest(request)
  const { changes } = await request.json()
  if (!changes || typeof changes !== 'object') error(400, 'body is { changes: { key: value } }')
  const results: DiskResult[] = []
  for (const [key, value] of Object.entries(changes)) {
    const args = ['set', key, asArg(value)]
    checkArgs('config', args)
    const r = await diskJson(['config', ...args])
    results.push(r)
    if (r.exit === 'error') return json({ error: `${key}: ${r.error}`, results }, { status: 400 })
  }
  return json({ results })
}
