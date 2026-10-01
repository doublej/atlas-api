<script lang="ts">
import { onMount } from 'svelte'
import { page } from '$app/state'
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Chip from '$lib/components/ui/Chip.svelte'
import { errorMessage, tildify } from '$lib/format'
import { http } from '$lib/http'
import { listKeys, listParam, writeQuery } from '$lib/processes/list-page'
import { StopFlow } from '$lib/processes/stop-flow.svelte'
import type { AppRow, ProcessSnapshot, StopTarget } from '$lib/processes/types'
import { Selection } from '$lib/selection.svelte'
import { TableSort } from '$lib/table-sort.svelte'
import { toast } from '$lib/toast.svelte'
import type { PageData } from './$types'
import ProcessGroups from './ProcessGroups.svelte'
import ProcessSummary from './ProcessSummary.svelte'
import { countKinds, groupByProject, matches, SORTS } from './rows'

/** One sample per poll feeds the sparklines; the snapshot itself is cached ~2s server-side. */
const POLL_MS = 5_000

let { data }: { data: PageData } = $props()

// Rendered from the server's snapshot in the first paint, then replaced by every poll.
let view = $derived<ProcessSnapshot | null>(data.view)
let error = $derived(data.error ?? '')
const updatedAt = $derived(view ? new Date(view.generatedAt).toLocaleTimeString() : '')

const params = page.url.searchParams
let query = $state(params.get('q') ?? '')
let all = $state(params.get('all') === '1')
let kinds = $state<string[]>(listParam(params, 'kind'))
let project = $state(params.get('project') ?? '')
const sort = new TableSort<string>(params.get('sort'), ['cpu', 'rss', 'uptime'])
if (params.has('desc')) sort.descending = params.get('desc') === '1'
const sel = new Selection<string>()
let search = $state<HTMLInputElement>()

const procs = $derived(new Map((view?.processes ?? []).map((p) => [p.pid, p])))
const rows = $derived(view?.rows ?? [])
const kindCounts = $derived(countKinds(rows))
const projects = $derived(
  [
    ...new Map(
      rows.flatMap((r) => (r.project ? [[r.project.path, r.project.name]] : [])),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1])),
)
const visible = $derived(
  rows.filter(
    (r) =>
      (!kinds.length || kinds.includes(r.kind)) &&
      (!project || r.project?.path === project) &&
      matches(r, procs, query),
  ),
)
const groups = $derived(groupByProject(visible))
/** Visible row ids in render order, so a shift-click range crosses the group tables. */
const order = $derived(groups.flatMap((g) => sort.apply(g.rows, SORTS).map((r) => r.id)))

$effect(() => sel.prune(rows.map((r) => r.id)))
$effect(() =>
  writeQuery({
    q: query.trim(),
    all: all ? '1' : null,
    kind: kinds.join(','),
    project,
    sort: sort.key,
    desc: sort.key ? (sort.descending ? '1' : '0') : null,
  }),
)

async function load(fresh = false) {
  try {
    const q = `history=1${all ? '&all=1' : ''}${fresh ? '&fresh=1' : ''}`
    view = await http.get<ProcessSnapshot>(`/api/processes?${q}`)
    error = ''
  } catch (e) {
    error = errorMessage(e)
  }
}

const flow = new StopFlow(() => load(true))

/** Every live member of the rows: stopping a row ends its whole process group. */
function stop(ids: string[], opts: { tree?: boolean; force?: boolean } = {}) {
  const picked = rows.filter((r) => ids.includes(r.id))
  const targets: StopTarget[] = picked.flatMap((r) =>
    r.pids.flatMap((pid) => {
      const p = procs.get(pid)
      return p && !p.zombie ? [{ pid, startedAt: p.startedAt }] : []
    }),
  )
  const names = new Map(targets.map((t) => [t.pid, procs.get(t.pid)?.name ?? 'process']))
  flow.ask(targets, opts, names)
}

const restartable = (row: AppRow) =>
  Boolean(row.atlasRun && row.project && data.runnable[row.project.path])

function restart(row: AppRow) {
  const path = row.project?.path ?? ''
  const run = data.runnable[path]
  if (!run) return
  flow.asking = {
    title: `Restart ${row.name}?`,
    message: `Stops its dev server, then runs ${run.command} again in ${tildify(path)}.`,
    items: [],
    confirmLabel: 'Restart',
    run: async () => {
      await http.delete('/api/run', { path })
      const started = await http.post<{ local?: string; url?: string }>('/api/run', {
        path,
        ...run,
      })
      toast(`Restarted ${row.name} at ${started.local ?? started.url}`)
      await load(true)
    },
  }
}

function toggleAll() {
  all = !all
  load()
}

function toggleKind(kind: string) {
  kinds = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind]
}

const onKeydown = listKeys({
  search: () => search,
  stop: (key) => stop(sel.size ? sel.list : key ? [key] : []),
  clear: () => sel.clear(),
  selectAll: () => sel.set(order, true),
  busy: () => flow.asking !== null,
})

onMount(() => {
  // A hidden tab polling spawns ps and lsof every tick for nobody.
  const timer = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
  return () => clearInterval(timer)
})
</script>

<svelte:head>
  <title>Atlas - Processes</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main>
  <header>
    <h1 class="t-h2">Processes</h1>
    <span class="t-small muted">
      {visible.length} of {rows.length} {all ? 'rows' : 'development rows'} on this Mac{updatedAt
        ? ` · updated ${updatedAt}`
        : ''}
    </span>
    <span class="spacer"></span>
    <input
      bind:this={search}
      class="search"
      type="search"
      placeholder="Filter name, pid, port, path…  ( / )"
      aria-label="Filter processes"
      bind:value={query}
    />
    <Chip pressed={all} onclick={toggleAll}>All processes</Chip>
    <Button onclick={() => load(true)}>Refresh</Button>
    <Button variant="danger" disabled={!sel.size} onclick={() => stop(sel.list)}>
      Stop selected ({sel.size})
    </Button>
  </header>

  <PageState {error} onretry={() => load(true)} empty={!view} emptyText="No snapshot yet.">
    {#if view}
      <ProcessSummary system={view.system} onpick={(name) => (query = name)} />

      <div class="filters">
        {#each kindCounts as [kind, n] (kind)}
          <Chip pressed={kinds.includes(kind)} onclick={() => toggleKind(kind)}>{kind} {n}</Chip>
        {/each}
        <select class="project" aria-label="Project" bind:value={project}>
          <option value="">All projects</option>
          {#each projects as [path, name] (path)}<option value={path}>{name}</option>{/each}
        </select>
      </div>

      <ProcessGroups
        {groups}
        {procs}
        history={view.history ?? {}}
        {sort}
        selection={sel}
        {order}
        {restartable}
        onstop={(picked, opts) => stop(picked.map((r) => r.id), opts)}
        onrestart={restart}
      />
      {#if !groups.length}<p class="t-small muted">No processes match.</p>{/if}
    {/if}
  </PageState>
</main>

<ConfirmDialog
  open={flow.asking !== null}
  title={flow.asking?.title ?? ''}
  message={flow.asking?.message}
  items={flow.asking?.items}
  confirmLabel={flow.asking?.confirmLabel}
  danger={flow.asking?.confirmLabel !== 'Restart'}
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

  header,
  .filters {
    display: flex;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    flex-wrap: wrap;
  }

  .filters {
    gap: var(--space-2);
  }

  .spacer {
    flex: 1;
  }

  .search,
  .project {
    min-width: 0;
    height: 28px;
    padding: 0 var(--space-2);
    font: inherit;
    font-size: 13px;
    color: var(--color-fg);
    background: var(--color-card);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .search {
    width: 260px;
  }

  @media (width < 768px) {
    .search {
      flex: 1 1 100%;
      width: auto;
    }
  }
</style>
