<script lang="ts">
import PageState from '$lib/components/feedback/PageState.svelte'
import Table from '$lib/components/table/Table.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import type { Column } from '$lib/table'
import type { PageData } from './$types'

type DaemonRow = NonNullable<PageData['daemons']>[number]
type Action = 'start' | 'stop' | 'restart'

let { daemons }: { daemons: DaemonRow[] | null } = $props()

const ACTIONS: Action[] = ['start', 'stop', 'restart']

const SELF_MANAGED_HINT =
  'self-managed — atlas-watchdog is the sole supervisor for this daemon, so the API refuses lifecycle actions on it'

/** Polled state, once there is any; until then the table shows what the server rendered. */
let polled = $state<DaemonRow[] | null>(null)
const source = $derived(polled ?? daemons)
const columns: Column<DaemonRow>[] = [
  { key: 'name', label: 'Daemon', sort: (d) => d.name, wrap: true, cell: nameCell },
  { key: 'state', label: 'State', sort: (d) => d.state.status, cell: stateCell },
  { key: 'port', label: 'Port', sort: (d) => d.port, cell: portCell },
  { key: 'actions', label: 'Actions', cell: actionsCell },
]
let loadError = $state('')
/** `<label>:<action>` while a lifecycle call is in flight — one at a time, on purpose. */
let pending = $state('')
let actionError = $state<Record<string, string>>({})

const TONE: Record<string, 'pos' | 'neg' | 'warn' | 'neutral'> = {
  running: 'pos',
  error: 'neg',
  idle: 'warn',
  stopped: 'neutral',
}

async function refresh() {
  try {
    polled = (await http.get<{ daemons: DaemonRow[] }>('/api/daemons')).daemons
    loadError = ''
  } catch (e) {
    loadError = errorMessage(e)
  }
}

async function act(label: string, action: Action) {
  pending = `${label}:${action}`
  actionError = { ...actionError, [label]: '' }
  try {
    await http.post(`/api/daemons/${encodeURIComponent(label)}`, { action })
  } catch (e) {
    const text = errorMessage(e)
    actionError = {
      ...actionError,
      [label]:
        text === 'writes disabled'
          ? 'writes disabled — set ATLAS_DAEMON_WRITE=1 in the plist and reload the daemon'
          : text,
    }
  } finally {
    pending = ''
    await refresh()
  }
}

// Poll while the tab is actually being looked at — a background tab polling launchctl every
// 10s buys nothing and each tick spawns a process per daemon.
$effect(() => {
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') refresh()
  }, 10_000)
  return () => clearInterval(timer)
})
</script>

{#snippet nameCell(d: DaemonRow)}
  <div class="name-line">
    <span class="name">{d.name}</span>
    {#if d.selfManaged}<Badge tone="info">self-managed</Badge>{/if}
    {#if d.stale}<Badge tone="warn">project path missing</Badge>{/if}
  </div>
  <code class="mono t-caption muted">{d.label}</code>
  <div class="paths mono t-caption muted-2">
    {#if d.plist}<div>{d.plist}</div>{/if}
    {#if d.logs?.stdout}<div>out {d.logs.stdout}</div>{/if}
    {#if d.logs?.stderr}<div>err {d.logs.stderr}</div>{/if}
  </div>
  {#if actionError[d.label]}
    <p class="t-caption err">{actionError[d.label]}</p>
  {/if}
{/snippet}

{#snippet stateCell(d: DaemonRow)}
  <Badge tone={TONE[d.state.status] ?? 'neutral'} dot="currentColor">{d.state.status}</Badge>
  <div class="t-caption muted-2">
    {d.state.pid ? `pid ${d.state.pid}` : 'no pid'}
    {#if d.state.lastExitStatus !== null}· exit {d.state.lastExitStatus}{/if}
    {#if d.scheduled}· scheduled{/if}
  </div>
{/snippet}

{#snippet portCell(d: DaemonRow)}
  {#if d.port}
    <span class="mono num">{d.port}</span>
    <div class="t-caption" class:muted-2={d.portInUse !== true}>
      {d.portInUse === null ? 'check timed out' : d.portInUse ? 'listening' : 'not bound'}
    </div>
  {:else}
    <span class="muted-2">—</span>
  {/if}
{/snippet}

{#snippet actionsCell(d: DaemonRow)}
  <span class="actions" title={d.selfManaged ? SELF_MANAGED_HINT : undefined}>
    {#each ACTIONS as action (action)}
      <Button
        onclick={() => act(d.label, action)}
        disabled={d.selfManaged || pending !== ''}
        variant={action === 'stop' ? 'danger' : 'ghost'}
      >
        {pending === `${d.label}:${action}` ? '…' : action}
      </Button>
    {/each}
  </span>
{/snippet}

{#snippet noDaemons()}No daemons registered.{/snippet}

<section>
  <header>
    <h2 class="t-h3">Daemons</h2>
    <span class="t-small muted">
      <code class="mono">shared/daemons.json</code> joined with live launchctl state · polled every 10s
    </span>
  </header>

  <PageState
    error={loadError || (source ? '' : 'Could not read /api/daemons.')}
    onretry={refresh}
    empty={!source}
  >
    <Card flush>
      <Table label="Daemons" rows={source ?? []} key={(d) => d.label} {columns} empty={noDaemons} />
    </Card>
  </PageState>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .name-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: 2px;
  }
  .name {
    font-weight: 600;
  }
  .paths {
    margin-top: var(--space-1);
    overflow-wrap: anywhere;
  }

  .actions {
    display: inline-flex;
    gap: var(--space-1);
  }

  .err {
    margin-top: var(--space-2);
    color: var(--color-neg);
    overflow-wrap: anywhere;
  }
</style>
