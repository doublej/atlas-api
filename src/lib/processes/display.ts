/** How the /processes and /ports pages say what a snapshot or a stop holds. Pure, browser-safe. */
import type { StopRefusal, StopResponse } from './types'

export function bytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i && n < 10 ? 1 : 0)} ${units[i]}`
}

/** Seconds as the one or two largest units: `45s`, `12m`, `3h 5m`, `2d 4h`. */
export function duration(s: number): string {
  const units: [number, string][] = [
    [86_400, 'd'],
    [3_600, 'h'],
    [60, 'm'],
  ]
  const i = units.findIndex(([size]) => s >= size)
  if (i < 0) return `${Math.round(s)}s`
  const [size, unit] = units[i]
  const [next, nextUnit] = units[i + 1] ?? [1, 's']
  const rest = Math.floor((s % size) / next)
  return `${Math.floor(s / size)}${unit}${rest && i < 2 ? ` ${rest}${nextUnit}` : ''}`
}

const REFUSALS: Record<StopRefusal, string> = {
  'pid-reused': 'restarted since this list was read',
  'protected-pid': 'protected',
  'other-user': "another user's process",
  'atlas-api': 'atlas-api itself',
  'launchd-job': 'a launchd job',
  zombie: 'already exited (a zombie: stop its parent)',
}

/** `vite (pid 123): a launchd job com.x — restart it from System › Daemons`. */
export function refusalLine(name: string, pid: number, refusal: StopRefusal, label?: string) {
  const why = label
    ? `${REFUSALS[refusal]} ${label}: restart it from System › Daemons`
    : REFUSALS[refusal]
  return `${name} (pid ${pid}): ${why}`
}

/** One toast line for a finished stop, and whether it needs attention. */
export function stopSummary(res: StopResponse): { text: string; tone: 'info' | 'error' } {
  const count = (status: string) => res.results.filter((r) => r.status === status).length
  const parts = [
    [count('stopped'), 'stopped'],
    [count('killed'), 'killed'],
    [count('gone'), 'already gone'],
    [count('still-running'), 'still running (Force stop ends it)'],
    [count('refused'), 'refused'],
  ].filter(([n]) => n) as [number, string][]
  const text = parts.map(([n, what]) => `${n} ${what}`).join(', ') || 'Nothing to stop'
  return { text, tone: count('still-running') || count('refused') ? 'error' : 'info' }
}
