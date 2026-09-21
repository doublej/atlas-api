import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { json } from '@sveltejs/kit'
import { resolveLocal } from '$lib/config'
import type { RequestHandler } from './$types'

const ENV_PATTERN = /^\.env(\..+)?$/

function parseEnvContent(content: string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx <= 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    vars[key] = val
  }
  return vars
}

export const GET: RequestHandler = async ({ url }) => {
  const path = url.searchParams.get('path')
  if (!path) return json({ error: 'Missing path' }, { status: 400 })
  if (!resolveLocal(path)) {
    return json({ error: "path is not in this machine's catalog" }, { status: 400 })
  }

  try {
    const entries = await readdir(path)
    const envNames = entries.filter((f) => ENV_PATTERN.test(f)).sort()

    const files = await Promise.all(
      envNames.map(async (name) => {
        try {
          const content = await readFile(join(path, name), 'utf-8')
          return { name, content, variables: parseEnvContent(content) }
        } catch {
          return { name, content: null, variables: {} }
        }
      }),
    )

    return json({ files })
  } catch {
    return json({ files: [] })
  }
}
