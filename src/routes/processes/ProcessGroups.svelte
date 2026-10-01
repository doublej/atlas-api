<script lang="ts">
import { hostOf } from '$lib/components/dialogs/hostname/hostname.svelte'
import Table from '$lib/components/table/Table.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Card from '$lib/components/ui/Card.svelte'
import { tildify } from '$lib/format'
import { bytes, duration } from '$lib/processes/display'
import type { AppRow, ProcessFlag, ProcessInfo, RowHistory } from '$lib/processes/types'
import type { Selection } from '$lib/selection.svelte'
import type { Column, RowState } from '$lib/table'
import type { TableSort } from '$lib/table-sort.svelte'
import ProcessDetail from './ProcessDetail.svelte'
import { type Group, SORTS } from './rows'
import Sparkline from './Sparkline.svelte'

/** One card per project, one Table each; sort and selection are shared across all of them. */
interface Props {
  groups: Group[]
  procs: Map<number, ProcessInfo>
  history: Record<string, RowHistory>
  sort: TableSort<string>
  selection: Selection<string>
  order: string[]
  restartable: (row: AppRow) => boolean
  onstop: (rows: AppRow[], opts: { tree?: boolean; force?: boolean }) => void
  onrestart: (row: AppRow) => void
}

const { groups, procs, history, sort, selection, order, restartable, onstop, onrestart }: Props =
  $props()

const FLAG_TONE: Record<ProcessFlag, 'warn' | 'neg' | 'neutral'> = {
  orphan: 'warn',
  duplicate: 'warn',
  idle: 'neutral',
  heavy: 'neg',
}
const FLAG_TITLE: Record<ProcessFlag, string> = {
  orphan: 'Left behind: its parent exited or its folder is gone',
  duplicate: 'Another row serves the same checkout',
  idle: 'Up for a day or more without using CPU',
  heavy: '1 GB or more, or 90% CPU or more',
}
const mainOf = (row: AppRow) => procs.get(row.primary)

// The metric columns narrow to their number on a phone, where the sparklines are hidden; a
// percentage would make a <col> width void, so the bounds are in vw (full width from 768px).
const columns: Column<AppRow>[] = [
  { key: 'kind', width: '5rem', label: 'Kind', sort: SORTS.kind, cell: kindCell, hideBelow: 768 },
  { key: 'name', label: 'Name', sort: SORTS.name, cell: nameCell },
  {
    key: 'project',
    width: '9rem',
    label: 'Project',
    sort: SORTS.project,
    cell: projectCell,
    hideBelow: 1100,
  },
  {
    key: 'ports',
    width: 'clamp(4.25rem, 15vw, 7rem)',
    label: 'Ports',
    sort: SORTS.ports,
    cell: portsCell,
  },
  {
    key: 'cpu',
    width: 'clamp(3.75rem, 16vw, 7.5rem)',
    label: 'CPU',
    sort: SORTS.cpu,
    align: 'right',
    cell: cpuCell,
  },
  {
    key: 'rss',
    width: 'clamp(4.25rem, 17vw, 8rem)',
    label: 'Memory',
    sort: SORTS.rss,
    align: 'right',
    cell: rssCell,
  },
  {
    key: 'uptime',
    width: '5.5rem',
    label: 'Up',
    sort: SORTS.uptime,
    align: 'right',
    cell: upCell,
    hideBelow: 768,
  },
  { key: 'command', label: 'Command', cell: commandCell, hideBelow: 768 },
  { key: 'cwd', label: 'Folder', cell: cwdCell, hideBelow: 1100 },
]
</script>

{#snippet kindCell(row: AppRow)}<Badge>{row.kind}</Badge>{/snippet}

{#snippet nameCell(row: AppRow)}
  <span class="name" data-key={row.id}>
    <strong>{row.name}</strong>
    {#if row.tool && row.tool !== row.name}<span class="muted">{row.tool}</span>{/if}
    {#each row.flags as flag (flag)}
      <Badge tone={FLAG_TONE[flag]} title={FLAG_TITLE[flag]}>{flag}</Badge>
    {/each}
    {#if row.session}<span class="t-caption muted" title="Agent session">{row.session}</span>{/if}
    {#if row.pids.length > 1}<span class="t-caption muted">{row.pids.length} processes</span>{/if}
  </span>
{/snippet}

{#snippet projectCell(row: AppRow)}<span class="muted">{row.project?.name ?? ''}</span>{/snippet}

{#snippet portsCell(row: AppRow)}
  <span class="ports">
    {#each row.ports as port (port)}
      <a class="mono num" href="http://localhost:{port}" target="_blank" rel="noreferrer">:{port}</a>
    {/each}
    {#if row.atlasRun?.hostname}
      <!-- The slug the route has now; `atlasRun.slug` names the log file, which keeps the old one. -->
      <a href={row.atlasRun.hostname} target="_blank" rel="noreferrer">{hostOf(row.atlasRun.hostname).split('.')[0]}</a>
    {/if}
  </span>
{/snippet}

{#snippet cpuCell(row: AppRow)}
  <span class="metric">
    <Sparkline values={history[row.id]?.cpu ?? []} label="CPU over the last minutes" />
    <span class="num">{row.cpu.toFixed(1)}%</span>
  </span>
{/snippet}

{#snippet rssCell(row: AppRow)}
  <span class="metric">
    <Sparkline values={history[row.id]?.rss ?? []} label="Memory over the last minutes" />
    <span class="num">{bytes(row.rss)}</span>
  </span>
{/snippet}

{#snippet upCell(row: AppRow)}<span class="num muted">{duration(row.uptime)}</span>{/snippet}

{#snippet commandCell(row: AppRow, state: RowState)}
  <button type="button" class="command mono" aria-expanded={state.open} onclick={state.toggleOpen}>
    {mainOf(row)?.command || mainOf(row)?.exe || ''}
  </button>
{/snippet}

{#snippet cwdCell(row: AppRow)}
  <span class="mono muted path">{tildify(mainOf(row)?.cwd ?? '')}</span>
{/snippet}

{#snippet detail(row: AppRow)}
  <ProcessDetail
    {row}
    members={row.pids.flatMap((pid) => procs.get(pid) ?? [])}
    restartable={restartable(row)}
    onstop={(opts) => onstop([row], opts)}
    onrestart={() => onrestart(row)}
  />
{/snippet}

{#each groups as group (group.key)}
  <Card flush>
    <div class="head">
      <h2 class="t-small">{group.name}</h2>
      {#if group.path}<span class="t-caption mono muted path">{tildify(group.path)}</span>{/if}
      <span class="spacer"></span>
      <span class="t-caption muted num count">{group.rows.length} · {bytes(group.rss)}</span>
    </div>
    <Table
      label="{group.name} processes"
      rows={group.rows}
      key={(r) => r.id}
      {columns}
      {sort}
      {selection}
      {order}
      rowLabel={(r) => `${r.name} (pid ${r.primary})`}
      expanded={detail}
      maxHeight={group.rows.length > 12 ? '70vh' : undefined}
    />
  </Card>
{/each}

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--hairline) solid var(--color-border-soft);
  }

  .head h2 {
    font-weight: 600;
    white-space: nowrap;
  }

  .head .path {
    flex: 0 1 auto;
    min-width: 0;
    white-space: nowrap;
  }

  .spacer {
    flex: 1;
  }

  .count {
    white-space: nowrap;
  }

  .name,
  .ports,
  .metric {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .metric {
    justify-content: flex-end;
  }

  .ports a {
    color: var(--color-accent);
    text-decoration: none;
  }

  .ports a:hover {
    text-decoration: underline;
  }

  .command {
    max-width: 100%;
    overflow: hidden;
    padding: 0;
    font-size: 12px;
    text-align: left;
    text-overflow: ellipsis;
    color: var(--color-fg-2);
    background: none;
    border: none;
    cursor: pointer;
  }

  .command:hover {
    color: var(--color-fg);
  }

  @media (width < 768px) {
    .metric :global(svg) {
      display: none;
    }
  }

  .path {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }
</style>
