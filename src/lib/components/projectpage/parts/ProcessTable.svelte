<script lang="ts">
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import Table from '$lib/components/table/Table.svelte'
import Button from '$lib/components/ui/Button.svelte'
import { bytes, duration } from '$lib/processes/display'
import { StopFlow } from '$lib/processes/stop-flow.svelte'
import type { AppRow } from '$lib/processes/types'
import type { Column } from '$lib/table'
import type { ProjectProcesses } from '../processes.svelte'

/** The project's live processes, each with Stop (a dry run lists what ends, then one confirm). */
const { processes }: { processes: ProjectProcesses } = $props()

const flow = new StopFlow(() => processes.load(true))

function stop(row: AppRow): void {
  const targets = processes.targets([row])
  const names = new Map(targets.map((t) => [t.pid, processes.procs.get(t.pid)?.name ?? row.name]))
  flow.ask(targets, {}, names)
}

const columns: Column<AppRow>[] = [
  { key: 'name', label: 'Process', sort: (r) => r.name, cell: nameCell },
  { key: 'ports', label: 'Ports', width: '110px', cell: portsCell },
  { key: 'cpu', label: 'CPU', width: '64px', align: 'right', sort: (r) => r.cpu, cell: cpuCell },
  { key: 'rss', label: 'Memory', width: '84px', align: 'right', sort: (r) => r.rss, cell: rssCell },
  {
    key: 'uptime',
    label: 'Up',
    width: '84px',
    align: 'right',
    hideBelow: 768,
    sort: (r) => r.uptime,
    cell: upCell,
  },
  { key: 'stop', label: 'Stop', hideLabel: true, width: '84px', cell: stopCell },
]
</script>

{#snippet nameCell(r: AppRow)}
  <span class="name">{r.tool ?? r.name}</span>
  <span class="muted-2 t-caption">{r.kind}{r.flags.length ? ` · ${r.flags.join(', ')}` : ''}</span>
{/snippet}
{#snippet portsCell(r: AppRow)}<span class="num">{r.ports.join(', ') || '—'}</span>{/snippet}
{#snippet cpuCell(r: AppRow)}<span class="num">{r.cpu.toFixed(0)}%</span>{/snippet}
{#snippet rssCell(r: AppRow)}<span class="num">{bytes(r.rss)}</span>{/snippet}
{#snippet upCell(r: AppRow)}<span class="num">{duration(r.uptime)}</span>{/snippet}
{#snippet stopCell(r: AppRow)}<Button variant="danger" onclick={() => stop(r)}>Stop</Button>{/snippet}

<PageState
  loading={!processes.loaded}
  error={processes.error}
  onretry={() => processes.load(true)}
  empty={!processes.rows.length}
  emptyText="Nothing of this project is running."
>
  <Table label="Running processes" rows={processes.rows} key={(r) => r.id} {columns} />
</PageState>

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
  .name {
    margin-right: var(--space-2);
    font-weight: 500;
  }
</style>
