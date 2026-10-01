<script lang="ts">
import PageState from '$lib/components/feedback/PageState.svelte'
import Table from '$lib/components/table/Table.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Chip from '$lib/components/ui/Chip.svelte'
import type { Analysis, DiskSettings, ProjectRow } from '$lib/disk-types'
import { Selection } from '$lib/selection.svelte'
import type { Column } from '$lib/table'
import { TableSort } from '$lib/table-sort.svelte'
import DiskArchiveModal from './DiskArchiveModal.svelte'
import { ago, human, runJob } from './disk-client.svelte'

let { analysis, settings }: { analysis: Analysis | null; settings: DiskSettings | null } = $props()

const STATES = ['eligible', 'inactive', 'active'] as const
const TONE = { eligible: 'accent', inactive: 'neutral', active: 'pos' } as const

let filter = $state<ProjectRow['state'] | 'all'>('eligible')
let planning = $state(false)
const sel = new Selection()
/** Sizes, ages, dates and flags open high-to-low. */
const sort = new TableSort<string>(null, ['size', 'age', 'commit', 'flags'])
const columns: Column<ProjectRow>[] = [
  { key: 'id', label: 'Project', sort: (p) => p.id, cell: idCell },
  { key: 'size', label: 'Size', sort: (p) => p.bytes, align: 'right', cell: sizeCell },
  { key: 'state', label: 'State', sort: (p) => STATES.indexOf(p.state), cell: stateCell },
  { key: 'age', label: 'Age', sort: (p) => p.ageDays, align: 'right', cell: ageCell },
  { key: 'ageFile', label: 'Age set by', sort: (p) => p.ageFile, cell: ageFileCell },
  { key: 'commit', label: 'Last commit', sort: (p) => p.lastCommit, cell: commitCell },
  {
    key: 'flags',
    label: 'Flags',
    sort: (p) => Number(p.dirty) + Number(p.push === 'unpushed'),
    cell: flagsCell,
  },
]

const rows = $derived(
  (analysis?.projects ?? []).filter((p) => filter === 'all' || p.state === filter),
)
const chosen = $derived((analysis?.projects ?? []).filter((p) => sel.has(p.id)))

$effect(() => sel.prune((analysis?.projects ?? []).map((p) => p.id)))
</script>

{#snippet idCell(p: ProjectRow)}<span class="mono">{p.id}</span>{/snippet}
{#snippet sizeCell(p: ProjectRow)}<span class="num">{human(p.bytes)}</span>{/snippet}
{#snippet stateCell(p: ProjectRow)}<Badge tone={TONE[p.state]}>{p.state}</Badge>{/snippet}
{#snippet ageCell(p: ProjectRow)}<span class="num">{p.ageDays === null ? '–' : `${p.ageDays}d`}</span>{/snippet}
{#snippet ageFileCell(p: ProjectRow)}<span class="mono muted">{p.ageFile ?? 'no edit files'}</span>{/snippet}
{#snippet commitCell(p: ProjectRow)}<span class="num muted">{p.lastCommit?.slice(0, 10) ?? '–'}</span>{/snippet}
{#snippet flagsCell(p: ProjectRow)}
  {#if p.dirty}<Badge tone="warn">uncommitted</Badge>{/if}
  {#if p.push === 'unpushed'}<Badge tone="warn">unpushed</Badge>{/if}
  {#if p.push === 'unknown'}<Badge title="no remote, or it couldn't be compared">push?</Badge>{/if}
{/snippet}
{#snippet noRows()}No projects {filter === 'all' ? '' : `in state ${filter}`} — Rescan to analyse.{/snippet}

<section>
  <div class="bar">
    <h2 class="t-h3">Projects</h2>
    <span class="t-caption muted">
      {analysis ? `${analysis.projects.length} projects · analysis ${ago(analysis.ranAt)}` : 'no analysis yet'}
    </span>
    <span class="spacer"></span>
    <Button onclick={() => runJob('analyze', [])}>Rescan</Button>
    <Button variant="primary" disabled={!sel.size} onclick={() => (planning = true)}>
      Archive selected ({sel.size})
    </Button>
  </div>
  <PageState empty={!analysis} emptyText="No analysis yet — Rescan measures every project.">
    <div class="bar">
      <Chip pressed={filter === 'all'} onclick={() => (filter = 'all')}>all</Chip>
      {#each STATES as s (s)}
        <Chip pressed={filter === s} onclick={() => (filter = s)}>{s}</Chip>
      {/each}
    </div>

    <Card flush>
      <Table
        label="Projects"
        {rows}
        key={(p) => p.id}
        {columns}
        {sort}
        selection={sel}
        empty={noRows}
        maxHeight="70vh"
      />
    </Card>
  </PageState>
</section>

{#if planning && settings}
  <DiskArchiveModal rows={chosen} {settings} onclose={() => (planning = false)} ondone={() => sel.clear()} />
{/if}
