<script lang="ts">
import { onMount } from 'svelte'
import SortHeader from '$lib/components/table/SortHeader.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { Listener, ListenerGroup } from '$lib/listeners'
import { TableSort } from '$lib/table-sort.svelte'

const POLL_MS = 15_000
const GROUPS: { id: ListenerGroup; label: string }[] = [
  { id: 'project', label: 'Projects' },
  { id: 'service', label: 'Services' },
  { id: 'docker', label: 'Docker' },
  { id: 'system', label: 'System & apps' },
]

let listeners = $state<Listener[]>([])
let updatedAt = $state('')
let error = $state('')
let loading = $state(false)
let query = $state('')
let selected = $state(new Set<number>())
/** Last plainly clicked row — the anchor of a shift-click range. */
let anchor = $state<number | null>(null)

const q = $derived(query.trim().toLowerCase())
const visible = $derived(
  q
    ? listeners.filter((l) =>
        [l.name, String(l.port), l.cwd ?? '', l.command].some((s) => s.toLowerCase().includes(q)),
      )
    : listeners,
)
/** One sort shared by every owner group. */
const sort = new TableSort<'name' | 'port' | 'pid' | 'path' | 'hostname'>()
const sections = $derived(
  GROUPS.map((g) => ({
    ...g,
    rows: sort.apply(
      visible.filter((l) => l.group === g.id),
      {
        name: (l) => l.name,
        port: (l) => l.port,
        pid: (l) => l.pid,
        path: (l) => l.project?.path ?? l.cwd,
        hostname: (l) => l.hostname,
      },
    ),
  })).filter((s) => s.rows.length),
)
/** Visible pids in render order, for shift-range and select-all. */
const ordered = $derived(sections.flatMap((s) => s.rows.map((r) => r.pid)))
const allSelected = $derived(ordered.length > 0 && ordered.every((pid) => selected.has(pid)))

const tildify = (path: string | undefined) => path?.replace(/^\/Users\/[^/]+\//, '~/') ?? ''

async function load(fresh = false) {
  loading = true
  try {
    const res = await fetch(`/api/ports/listeners${fresh ? '?fresh=1' : ''}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { listeners: Listener[]; updatedAt: string }
    listeners = body.listeners
    updatedAt = new Date(body.updatedAt).toLocaleTimeString()
    const alive = new Set(listeners.map((l) => l.pid))
    selected = new Set([...selected].filter((pid) => alive.has(pid)))
    error = ''
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  } finally {
    loading = false
  }
}

async function kill(pids: number[], scope = '') {
  const n = pids.length
  if (!n || !confirm(`Kill ${n} process${n === 1 ? '' : 'es'}${scope ? ` in ${scope}` : ''}?`))
    return
  await fetch('/api/ports/kill', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pids }),
  })
  selected = new Set([...selected].filter((pid) => !pids.includes(pid)))
  await load(true)
}

function toggle(pid: number, on: boolean) {
  const next = new Set(selected)
  if (on) next.add(pid)
  else next.delete(pid)
  selected = next
  anchor = pid
}

function setMany(pids: number[], on: boolean) {
  const next = new Set(selected)
  for (const pid of pids) on ? next.add(pid) : next.delete(pid)
  selected = next
}

function selectRange(from: number, to: number) {
  const [a, b] = [ordered.indexOf(from), ordered.indexOf(to)].sort((x, y) => x - y)
  if (a !== -1) setMany(ordered.slice(a, b + 1), true)
}

/** Plain click selects one row, shift extends from the anchor, cmd/ctrl toggles. */
function clickRow(pid: number, e: MouseEvent) {
  if ((e.target as HTMLElement).closest('input, a, button')) return
  if (e.shiftKey && anchor !== null) {
    selectRange(anchor, pid)
  } else if (e.metaKey || e.ctrlKey) {
    toggle(pid, !selected.has(pid))
  } else {
    const sole = selected.size === 1 && selected.has(pid)
    selected = sole ? new Set() : new Set([pid])
    anchor = pid
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.target instanceof Element && e.target.closest('input, textarea, select')) return
  if (e.key === 'Escape') {
    selected = new Set()
    anchor = null
  } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    selected = new Set(ordered)
  }
}

onMount(() => {
  load()
  // A hidden tab polling spawns lsof + ps + docker every tick for nobody.
  const timer = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
  return () => clearInterval(timer)
})
</script>

<svelte:head>
  <title>Atlas - Ports</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main>
  <header>
    <h1 class="t-h2">Ports</h1>
    <span class="t-small muted">
      {listeners.length} listening on this Mac{updatedAt ? ` · updated ${updatedAt}` : ''}
    </span>
    <span class="spacer"></span>
    <input class="search" type="search" placeholder="Filter name, port, path…" bind:value={query} />
    <label class="t-small muted select-all">
      <input
        type="checkbox"
        checked={allSelected}
        indeterminate={!allSelected && ordered.some((pid) => selected.has(pid))}
        onchange={(e) => setMany(ordered, e.currentTarget.checked)}
      />
      select all
    </label>
    <Button onclick={() => load(true)} disabled={loading}>Refresh</Button>
    <Button variant="danger" disabled={!selected.size} onclick={() => kill([...selected])}>
      Kill selected ({selected.size})
    </Button>
  </header>

  {#if error}<p class="t-small err">Listener scan failed: {error}</p>{/if}
  {#if !listeners.length && loading}<p class="t-small muted">Scanning listeners…</p>{/if}

  {#each sections as section (section.id)}
    <Card flush>
      <div class="section-head">
        <input
          type="checkbox"
          aria-label="Select all in {section.label}"
          checked={section.rows.every((r) => selected.has(r.pid))}
          onchange={(e) =>
            setMany(
              section.rows.map((r) => r.pid),
              e.currentTarget.checked,
            )}
        />
        <h2 class="t-small">{section.label}</h2>
        <span class="t-caption muted num">{section.rows.length}</span>
        {#if section.rows.length > 1}
          <span class="spacer"></span>
          <Button
            variant="danger"
            onclick={() =>
              kill(
                section.rows.map((r) => r.pid),
                section.label,
              )}
          >
            Kill all {section.rows.length}
          </Button>
        {/if}
      </div>
      <div class="scroll">
        <table>
          <thead>
            <tr class="t-caption muted">
              <th></th>
              <SortHeader {sort} key="name" label="Name" />
              <SortHeader {sort} key="port" label="Port" />
              <SortHeader {sort} key="pid" label="PID" />
              <SortHeader {sort} key="path" label="Path" />
              <SortHeader {sort} key="hostname" label="Hostname" />
            </tr>
          </thead>
          <tbody>
            {#each section.rows as l (l.port)}
              <tr
                class="t-small"
                class:selected={selected.has(l.pid)}
                onclick={(e) => clickRow(l.pid, e)}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label="Select {l.name}"
                    checked={selected.has(l.pid)}
                    onchange={(e) => toggle(l.pid, e.currentTarget.checked)}
                  />
                </td>
                <td class="name" title={l.command}>
                  {l.name}
                  {#if l.project?.framework && l.project.framework !== 'unknown'}
                    <Badge>{l.project.framework}</Badge>
                  {/if}
                </td>
                <td>
                  <a class="mono num" href="http://localhost:{l.port}" target="_blank" rel="noreferrer"
                    >:{l.port}</a
                  >
                </td>
                <td class="mono num muted">{l.pid}</td>
                <td class="mono muted path" title={l.cwd}>{tildify(l.project?.path ?? l.cwd)}</td>
                <td class="host">
                  {#if l.hostname}
                    <a class="mono" href={l.hostname} target="_blank" rel="noreferrer"
                      >{l.hostname.replace('https://', '')}</a
                    >
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  {:else}
    {#if !loading && !error}<p class="t-small muted">No listeners match.</p>{/if}
  {/each}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: var(--col-max);
    margin: 0 auto;
    padding: var(--space-6) var(--page-pad) var(--space-16);
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .search {
    min-width: 0;
    width: 220px;
    height: 28px;
    padding: 0 var(--space-2);
    font: inherit;
    font-size: 13px;
    color: var(--color-fg);
    background: var(--color-card);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .select-all {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .section-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--hairline) solid var(--color-border-soft);
  }

  .section-head h2 {
    font-weight: 600;
  }

  .scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  table :global(th) {
    padding: var(--space-1) var(--space-3);
    font-weight: 500;
    text-align: left;
  }

  td {
    padding: var(--space-1) var(--space-3);
    border-top: var(--hairline) solid var(--color-border-soft);
    white-space: nowrap;
  }

  th:first-child,
  td:first-child {
    width: 28px;
  }

  tbody tr {
    cursor: default;
  }

  tbody tr:hover {
    background: var(--color-card-2);
  }

  tr.selected {
    background: var(--color-accent-soft);
  }

  .name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 500;
  }

  .err {
    color: var(--color-neg);
  }

  td a {
    color: var(--color-accent);
    text-decoration: none;
  }

  td a:hover {
    text-decoration: underline;
  }

  .path,
  .host {
    max-width: 320px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
