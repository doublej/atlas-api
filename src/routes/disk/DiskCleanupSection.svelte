<script lang="ts">
import PageState from '$lib/components/feedback/PageState.svelte'
import Table from '$lib/components/table/Table.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Chip from '$lib/components/ui/Chip.svelte'
import type { FolderRow, Risk, Scan } from '$lib/disk-types'
import { tildify } from '$lib/format'
import { Selection } from '$lib/selection.svelte'
import type { Column } from '$lib/table'
import { sortRows, TableSort } from '$lib/table-sort.svelte'
import DiskCleanModal from './DiskCleanModal.svelte'
import { ago, human, runJob } from './disk-client.svelte'

let { scan }: { scan: Scan | null } = $props()

const RISKS: { id: Risk; tone: 'pos' | 'warn' | 'neg'; note: string }[] = [
  { id: 'rebuildable', tone: 'pos', note: 'the build recreates it' },
  { id: 'reinstallable', tone: 'warn', note: 'a package install brings it back' },
  { id: 'review', tone: 'neg', note: 'look before it goes — Trash by default' },
]

let shown = $state(new Set<Risk>(['rebuildable', 'reinstallable', 'review']))
let reviewing = $state(false)
const sel = new Selection<string>()
/** One sort and one selection for every risk group, so the groups stay comparable. */
const sort = new TableSort<string>(null, ['size'])
const columns: Column<FolderRow>[] = [
  {
    key: 'size',
    width: '5.5rem',
    label: 'Size',
    sort: (f) => f.bytes,
    align: 'right',
    cell: sizeCell,
  },
  { key: 'path', label: 'Folder', sort: (f) => f.path, cell: pathCell },
  { key: 'inUse', width: '7.5rem', label: 'In use', sort: (f) => f.inUse, cell: inUseCell },
  {
    key: 'why',
    label: 'What it is',
    sort: (f) => f.why,
    wrap: true,
    hideBelow: 768,
    cell: whyCell,
  },
  {
    key: 'restore',
    label: 'How it comes back',
    sort: (f) => f.restore,
    wrap: true,
    hideBelow: 1100,
    cell: restoreCell,
  },
]
const sorter = $derived(columns.find((c) => c.key === sort.key)?.sort)

const groups = $derived(
  RISKS.filter((r) => shown.has(r.id))
    .map((r) => {
      const rows = (scan?.folders ?? []).filter((f) => f.risk === r.id)
      return { ...r, rows: sorter ? sortRows(rows, sorter, sort.descending) : rows }
    })
    .filter((g) => g.rows.length),
)
/** Every visible row in render order, so a shift-click range can cross the groups. */
const ordered = $derived(groups.flatMap((g) => g.rows.map((r) => r.path)))
const chosen = $derived((scan?.folders ?? []).filter((f) => sel.has(f.path)))

$effect(() => sel.prune((scan?.folders ?? []).map((f) => f.path)))

function toggleRisk(r: Risk) {
  const next = new Set(shown)
  next.has(r) ? next.delete(r) : next.add(r)
  shown = next
}
</script>

{#snippet sizeCell(f: FolderRow)}<span class="num">{human(f.bytes)}</span>{/snippet}
{#snippet pathCell(f: FolderRow)}<span class="mono" title={f.path}>{tildify(f.path)}{f.nested ? ' (nested)' : ''}</span>{/snippet}
<!-- Only the badge stays on one line: a long holder ("DTServiceHub (pid …) works in its project")
     on one line squeezed the Folder column down to "~/d…". -->
{#snippet inUseCell(f: FolderRow)}
  {#if f.inUse}<Badge tone="warn" title="something seems to use it">in use</Badge><span class="holder t-caption muted">{f.inUse}</span>{/if}
{/snippet}
{#snippet whyCell(f: FolderRow)}<span class="muted">{f.why}</span>{/snippet}
{#snippet restoreCell(f: FolderRow)}<span class="muted mono">{f.restore}</span>{/snippet}

<section>
  <div class="bar">
    <h2 class="t-h3">Cleanup</h2>
    <span class="t-caption muted">
      {scan ? `${human(scan.totalBytes)} in ${scan.folders.length} folders · scan ${ago(scan.ranAt)}` : 'no scan yet'}
    </span>
    <span class="spacer"></span>
    <Button onclick={() => runJob('scan', [])}>Scan</Button>
    <Button variant="primary" disabled={!sel.size} onclick={() => (reviewing = true)}>Review ({sel.size})</Button>
  </div>
  <div class="bar">
    {#each RISKS as r (r.id)}
      <Chip pressed={shown.has(r.id)} onclick={() => toggleRisk(r.id)}>{r.id}</Chip>
    {/each}
  </div>

  <PageState
    empty={!groups.length}
    emptyText={scan ? 'Nothing at these risk levels.' : 'Run a scan to list rebuildable folders under your home folder.'}
  >
    {#each groups as g (g.id)}
      <Card flush>
        <div class="group t-small">
          <Badge tone={g.tone}>{g.id}</Badge>
          <span class="muted">{g.note} · {g.rows.length} folders</span>
        </div>
        <Table
          label="{g.id} folders"
          rows={g.rows}
          key={(f) => f.path}
          {columns}
          {sort}
          selection={sel}
          order={ordered}
          dim={(f) => f.nested}
          maxHeight="60vh"
        />
      </Card>
    {/each}
  </PageState>
</section>

{#if reviewing}
  <DiskCleanModal rows={chosen} onclose={() => (reviewing = false)} ondone={() => sel.clear()} />
{/if}

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  section .bar {
    margin-bottom: 0;
  }

  .holder {
    display: block;
    min-width: 5rem;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
  }
</style>
