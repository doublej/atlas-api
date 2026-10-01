import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { json } from '@sveltejs/kit'
import { redact } from '$lib/processes/parse'
import { LOG_DIR } from '$lib/processes/snapshot'
import type { RequestHandler } from './$types'

/** Enough to see why a dev server died; a log can grow for days. */
const TAIL_BYTES = 256 * 1024
/** A file name inside LOG_DIR: no separators, no leading dot (so no `..`). */
const SLUG = /^[\w][\w.-]*$/

/** `?slug=` → the tail of `~/dev/.atlas-logs/<slug>.log`, the output of a `POST /api/run` server. Read-only. */
export const GET: RequestHandler = async ({ url }) => {
  const slug = url.searchParams.get('slug') ?? ''
  if (!SLUG.test(slug)) return json({ error: 'slug must be a log name' }, { status: 400 })
  const file = await open(join(LOG_DIR, `${slug}.log`)).catch(() => null)
  if (!file) return json({ error: `no log for ${slug}` }, { status: 404 })
  try {
    const { size } = await file.stat()
    const length = Math.min(size, TAIL_BYTES)
    const { buffer } = await file.read(Buffer.alloc(length), 0, length, size - length)
    return new Response(redact(buffer.toString('utf8')), {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  } finally {
    await file.close()
  }
}
