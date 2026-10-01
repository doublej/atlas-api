<script lang="ts" module>
import type { Listener } from '$lib/listeners'

export interface Section {
  id: string
  label: string
  rows: Listener[]
}
</script>

<script lang="ts">
import Table from '$lib/components/table/Table.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import { tildify } from '$lib/format'
import type { PortCollision } from '$lib/ports'
import type { Selection } from '$lib/selection.svelte'
import type { Column } from '$lib/table'
import type { TableSort } from '$lib/table-sort.svelte'
import { MACOS_PORTS } from './known-ports'

/** One card per owner group; rows are keyed by port, never pid — one pid can hold several. */
interface Props {
  sections: Section[]
  collisions: Map<number, PortCollision>
  sort: TableSort<string>
  selection: Selection<number>
  order: number[]
  onstop: (rows: Listener[]) => void
}

const { sections, collisions, sort, selection, order, onstop }: Props = $props()

const host = (url: string) => url.replace(/^https?:\/\//, '')
/** The owner's row on /processes: a pid search finds exactly its row. */
const processLink = (l: Listener) => `/processes?all=1&q=${l.pid}`

const columns: Column<Listener>[] = [
  { key: 'port', width: '6rem', label: 'Port', sort: (l) => l.port, cell: portCell },
  { key: 'name', label: 'Owner', sort: (l) => l.name, cell: nameCell },
  { key: 'open', label: 'Open', cell: openCell },
  { key: 'pid', width: '5.5rem', label: 'PID', sort: (l) => l.pid, align: 'right', cell: pidCell, hideBelow: 768 },
  { key: 'path', label: 'Path', sort: (l) => l.project?.path ?? l.cwd, cell: pathCell, hideBelow: 768 },
]
</script>

{#snippet portCell(l: Listener)}
  <span class="port" data-key={l.port}>
    <span class="mono num">{l.port}</span>
    {#if collisions.has(l.port)}
      {@const c = collisions.get(l.port)}
      <Badge tone="neg" title="Also declared by {c?.sources.map((s) => s.name).join(', ')}">collision</Badge>
    {/if}
  </span>
{/snippet}

{#snippet nameCell(l: Listener)}
  <span class="name">
    <a href={processLink(l)} title="Its process on /processes">{MACOS_PORTS[l.port] ?? l.name}</a>
    {#if MACOS_PORTS[l.port]}<span class="muted">{l.name}</span>{/if}
    {#if l.project?.framework && l.project.framework !== 'unknown'}<Badge>{l.project.framework}</Badge>{/if}
    <span class="t-caption muted">{l.kind}</span>
  </span>
{/snippet}

{#snippet openCell(l: Listener)}
  <span class="links">
    <a class="mono" href="http://localhost:{l.port}" target="_blank" rel="noreferrer">localhost:{l.port}</a>
    {#if l.hostname}
      <a class="mono" href={l.hostname} target="_blank" rel="noreferrer">{host(l.hostname)}</a>
    {/if}
  </span>
{/snippet}

{#snippet pidCell(l: Listener)}<span class="mono num muted">{l.pid}</span>{/snippet}

{#snippet pathCell(l: Listener)}
  <span class="mono muted path" title={l.cwd}>{tildify(l.project?.path ?? l.cwd ?? '')}</span>
{/snippet}

{#snippet detail(l: Listener)}
  <div class="detail t-small">
    <code class="mono">{l.command}</code>
    <span class="muted">
      pid {l.pid} · group {l.pgid} · started {new Date(l.startedAt).toLocaleString()}
      {#if l.cwd}· in {tildify(l.cwd)}{/if}
    </span>
    <a href={processLink(l)}>Show its process row</a>
  </div>
{/snippet}

{#each sections as section (section.id)}
  <Card flush>
    <div class="head">
      <h2 class="t-small">{section.label}</h2>
      <span class="t-caption muted num">{section.rows.length}</span>
      {#if section.rows.length > 1}
        <span class="spacer"></span>
        <Button variant="danger" onclick={() => onstop(section.rows)}>Stop all {section.rows.length}</Button>
      {/if}
    </div>
    <Table
      label="{section.label} listeners"
      rows={section.rows}
      key={(l) => l.port}
      {columns}
      {sort}
      {selection}
      {order}
      rowLabel={(l) => `${l.name} on :${l.port}`}
      expanded={detail}
      maxHeight={section.rows.length > 15 ? '70vh' : undefined}
    />
  </Card>
{/each}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--hairline) solid var(--color-border-soft);
  }

  .head h2 {
    font-weight: 600;
  }

  .spacer {
    flex: 1;
  }

  .port,
  .name,
  .links {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .name a {
    font-weight: 500;
    color: var(--color-fg);
    text-decoration: none;
  }

  .links a,
  .detail a {
    color: var(--color-accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  .path {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: bottom;
  }

  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--row-px);
  }

  .detail code {
    overflow-wrap: anywhere;
  }
</style>
