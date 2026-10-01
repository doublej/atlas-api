// The .history.jsonl sidecar next to every edited context file: one snapshot per write,
// newest last — backs the editor's History dropdown and Revert.

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const HISTORY_SUFFIX = '.history.jsonl'

export interface HistoryEntry {
  ts: string
  sha: string
  content: string
}

export const sha = (text: string): string =>
  createHash('sha256').update(text).digest('hex').slice(0, 12)

const historyPathFor = (p: string): string => p + HISTORY_SUFFIX

const isoSeconds = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

const MAX_HISTORY_ENTRIES = 20

/** Append the prior file content to the sidecar before an overwrite (one JSON line),
 *  keeping only the newest MAX_HISTORY_ENTRIES snapshots. */
export async function appendHistory(file: string, priorContent: string): Promise<void> {
  const record: HistoryEntry = { ts: isoSeconds(), sha: sha(priorContent), content: priorContent }
  const entries = [...(await readHistory(file)), record].slice(-MAX_HISTORY_ENTRIES)
  await writeFile(
    historyPathFor(file),
    entries.map((e) => `${JSON.stringify(e)}\n`).join(''),
    'utf-8',
  )
}

export async function readHistory(file: string): Promise<HistoryEntry[]> {
  let raw: string
  try {
    raw = await readFile(historyPathFor(file), 'utf-8')
  } catch {
    return []
  }
  const entries: HistoryEntry[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      entries.push(JSON.parse(t) as HistoryEntry)
    } catch {
      // skip a corrupt line rather than fail the whole read
    }
  }
  return entries
}

/** Remove and return the most recent snapshot (LIFO) — backs the revert action. */
export async function popHistory(file: string): Promise<HistoryEntry | null> {
  const entries = await readHistory(file)
  const last = entries.pop()
  if (!last) return null
  await writeFile(
    historyPathFor(file),
    entries.map((e) => `${JSON.stringify(e)}\n`).join(''),
    'utf-8',
  )
  return last
}
