<script lang="ts">
import SortHeader from '$lib/components/table/SortHeader.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import { TableSort } from '$lib/table-sort.svelte'
import type { PageData } from './$types'

type DaemonRow = NonNullable<PageData['daemons']>[number]
type Action = 'start' | 'stop' | 'restart'

let { daemons }: { daemons: DaemonRow[] | null } = $props()

const ACTIONS: Action[] = ['start', 'stop', 'restart']

const SELF_MANAGED_HINT =
  'self-managed — atlas-watchdog is the sole supervisor for this daemon, so the API refuses lifecycle actions on it'

/** Polled state, once there is any; until then the table shows what the server rendered. */
let polled = $state<DaemonRow[] | null>(null)
const sort = new TableSort<'name' | 'state' | 'port'>()
const rows = $derived(
  sort.apply(polled ?? daemons ?? [], {
    name: (d) => d.name,
    state: (d) => d.state.status,
    port: (d) => d.port,
  }),
)
let loadError = $state('')
/** `<label>:<action>` while a lifecycle call is in flight — one at a time, on purpose. */
let pending = $state('')
let actionError = $state<Record<string, string>>({})

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const TONE: Record<string, 'pos' | 'neg' | 'warn' | 'neutral'> = {
  running: 'pos',
  error: 'neg',
  idle: 'warn',
  stopped: 'neutral',
}

async function refresh() {
  try {
    const res = await fetch('/api/daemons')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    polled = ((await res.json()) as { daemons: DaemonRow[] }).daemons
    loadError = ''
  } catch (e) {
    loadError = message(e)
  }
}

async function act(label: string, action: Action) {
  pending = `${label}:${action}`
  actionError = { ...actionError, [label]: '' }
  try {
    const res = await fetch(`/api/daemons/${encodeURIComponent(label)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return
    throw new Error(
      body.error === 'writes disabled'
        ? 'writes disabled — set ATLAS_DAEMON_WRITE=1 in the plist and reload the daemon'
        : (body.error ?? `HTTP ${res.status}`),
    )
  } catch (e) {
    actionError = { ...actionError, [label]: message(e) }
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

<section>
  <header>
    <h2 class="t-h3">Daemons</h2>
    <span class="t-small muted">
      <code class="mono">shared/daemons.json</code> joined with live launchctl state · polled every 10s
    </span>
  </header>

  {#if loadError}
    <p class="t-small err">{loadError}</p>
  {:else if !(polled ?? daemons)}
    <p class="t-small err">Could not read /api/daemons.</p>
  {/if}

  <Card flush>
    <div class="scroll">
      <table>
        <thead>
          <tr>
            <SortHeader {sort} key="name" label="Daemon" />
            <SortHeader {sort} key="state" label="State" />
            <SortHeader {sort} key="port" label="Port" />
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as d (d.label)}
            <tr>
              <td>
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
              </td>
              <td>
                <Badge tone={TONE[d.state.status] ?? 'neutral'} dot="currentColor">{d.state.status}</Badge>
                <div class="t-caption muted-2">
                  {d.state.pid ? `pid ${d.state.pid}` : 'no pid'}
                  {#if d.state.lastExitStatus !== null}· exit {d.state.lastExitStatus}{/if}
                  {#if d.scheduled}· scheduled{/if}
                </div>
              </td>
              <td class="mono t-caption">
                {#if d.port}
                  <span class="num">{d.port}</span>
                  <div class:muted-2={d.portInUse !== true}>
                    {d.portInUse === null ? 'check timed out' : d.portInUse ? 'listening' : 'not bound'}
                  </div>
                {:else}
                  <span class="muted-2">—</span>
                {/if}
              </td>
              <td>
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
              </td>
            </tr>
          {:else}
            <tr><td colspan="4" class="empty t-small muted">No daemons registered.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
</section>

<style>
  header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }

  .scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    min-width: 640px;
    border-collapse: collapse;
    font-size: 13px;
  }
  table :global(th) {
    text-align: left;
    font-weight: 500;
    color: var(--color-muted);
    padding: var(--space-2) var(--row-px);
    border-bottom: var(--hairline) solid var(--color-border);
  }
  td {
    vertical-align: top;
    padding: var(--space-3) var(--row-px);
    border-bottom: var(--hairline) solid var(--color-border-soft);
  }
  tr:last-child td {
    border-bottom: none;
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

  .empty {
    padding: var(--space-5) var(--row-px);
  }
  .err {
    margin-top: var(--space-2);
    color: var(--color-neg);
    overflow-wrap: anywhere;
  }
</style>
