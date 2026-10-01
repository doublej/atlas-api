<script lang="ts">
import { onMount } from 'svelte'
import { page } from '$app/state'
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte'
import Notice from '$lib/components/feedback/Notice.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import Button from '$lib/components/ui/Button.svelte'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import type { Listener, ListenerGroup } from '$lib/listeners'
import { listKeys, writeQuery } from '$lib/processes/list-page'
import { StopFlow } from '$lib/processes/stop-flow.svelte'
import { Selection } from '$lib/selection.svelte'
import { TableSort } from '$lib/table-sort.svelte'
import type { PageData } from './$types'
import { MACOS_PORTS } from './known-ports'
import PortsTable, { type Section } from './PortsTable.svelte'

/** The snapshot behind it is cached ~2s; a port list does not need more than this. */
const POLL_MS = 5_000
const GROUPS: { id: ListenerGroup; label: string }[] = [
  { id: 'project', label: 'Projects' },
  { id: 'service', label: 'Services' },
  { id: 'docker', label: 'Docker' },
  { id: 'system', label: 'System & apps' },
]

let { data }: { data: PageData } = $props()

let listeners = $derived<Listener[]>(data.listeners)
let updatedAt = $derived(data.updatedAt)
let error = $derived(data.error ?? '')
const collisions = $derived(new Map(data.collisions.map((c) => [c.port, c])))

const params = page.url.searchParams
let query = $state(params.get('q') ?? '')
const sort = new TableSort<string>(params.get('sort'))
if (params.has('desc')) sort.descending = params.get('desc') === '1'
const sel = new Selection<number>()
let search = $state<HTMLInputElement>()

const q = $derived(query.trim().toLowerCase())
const visible = $derived(
  q
    ? listeners.filter((l) =>
        [
          l.name,
          String(l.port),
          l.project?.path ?? l.cwd ?? '',
          l.command,
          MACOS_PORTS[l.port] ?? '',
        ].some((s) => s.toLowerCase().includes(q)),
      )
    : listeners,
)
const sections = $derived<Section[]>(
  GROUPS.map((g) => ({ ...g, rows: visible.filter((l) => l.group === g.id) })).filter(
    (s) => s.rows.length,
  ),
)
const SORT_VALUES = {
  port: (l: Listener) => l.port,
  name: (l: Listener) => l.name,
  pid: (l: Listener) => l.pid,
  path: (l: Listener) => l.project?.path ?? l.cwd,
}
/** Visible ports in render order, so a shift-click range crosses the group tables. */
const order = $derived(
  sections.flatMap((s) =>
    (sort.key && sort.key in SORT_VALUES ? sort.apply(s.rows, SORT_VALUES) : s.rows).map(
      (l) => l.port,
    ),
  ),
)

$effect(() => sel.prune(listeners.map((l) => l.port)))
$effect(() =>
  writeQuery({
    q: query.trim(),
    sort: sort.key,
    desc: sort.key ? (sort.descending ? '1' : '0') : null,
  }),
)

async function load(fresh = false) {
  try {
    const body = await http.get<{ listeners: Listener[]; updatedAt: string }>(
      `/api/ports/listeners${fresh ? '?fresh=1' : ''}`,
    )
    listeners = body.listeners
    updatedAt = body.updatedAt
    error = ''
  } catch (e) {
    error = errorMessage(e)
  }
}

const flow = new StopFlow(() => load(true))

/** Ports map to processes many-to-one: each pid is stopped once. */
function stop(rows: Listener[]) {
  const byPid = new Map(rows.map((l) => [l.pid, l]))
  const targets = [...byPid.values()].map(({ pid, startedAt }) => ({ pid, startedAt }))
  flow.ask(targets, {}, new Map([...byPid].map(([pid, l]) => [pid, l.name])))
}

const stopPorts = (ports: number[]) => stop(listeners.filter((l) => ports.includes(l.port)))

const onKeydown = listKeys({
  search: () => search,
  stop: (key) => stopPorts(sel.size ? sel.list : key ? [Number(key)] : []),
  clear: () => sel.clear(),
  selectAll: () => sel.set(order, true),
  busy: () => flow.asking !== null,
})

onMount(() => {
  // A hidden tab polling spawns ps, netstat and lsof every tick for nobody.
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
      {listeners.length} listening on this Mac{updatedAt
        ? ` · updated ${new Date(updatedAt).toLocaleTimeString()}`
        : ''}
    </span>
    <span class="spacer"></span>
    <input
      bind:this={search}
      class="search"
      type="search"
      placeholder="Filter port, name, path…  ( / )"
      aria-label="Filter ports"
      bind:value={query}
    />
    <Button onclick={() => load(true)}>Refresh</Button>
    <Button variant="danger" disabled={!sel.size} onclick={() => stopPorts(sel.list)}>
      Stop selected ({sel.size})
    </Button>
  </header>

  {#if collisions.size}
    <Notice tone="warn">
      {collisions.size} declared port{collisions.size === 1 ? ' is' : 's are'} claimed twice:
      {[...collisions.keys()].join(', ')}.
      {#snippet action()}<a class="audit" href="/system?tab=ports">Port audit</a>{/snippet}
    </Notice>
  {/if}

  <PageState
    loading={!listeners.length && !error && !updatedAt}
    loadingText="Scanning listeners…"
    {error}
    onretry={() => load(true)}
    empty={!sections.length}
    emptyText={query ? 'No listeners match.' : 'Nothing is listening.'}
  >
    <PortsTable {sections} {collisions} {sort} selection={sel} {order} onstop={stop} />
  </PageState>
</main>

<ConfirmDialog
  open={flow.asking !== null}
  title={flow.asking?.title ?? ''}
  message={flow.asking?.message}
  items={flow.asking?.items}
  confirmLabel={flow.asking?.confirmLabel}
  danger
  onconfirm={() => flow.asking?.run()}
  onclose={() => (flow.asking = null)}
/>

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
    gap: var(--space-2) var(--space-3);
    flex-wrap: wrap;
  }

  .spacer {
    flex: 1;
  }

  .search {
    min-width: 0;
    width: 240px;
    height: 28px;
    padding: 0 var(--space-2);
    font: inherit;
    font-size: 13px;
    color: var(--color-fg);
    background: var(--color-card);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  @media (width < 768px) {
    .search {
      flex: 1 1 100%;
      width: auto;
    }
  }

  .audit {
    color: var(--color-accent);
  }
</style>
