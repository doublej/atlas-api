<script lang="ts">
import PageState from '$lib/components/feedback/PageState.svelte'
import Table from '$lib/components/table/Table.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { DiskItem } from '$lib/disk'
import type { DiskSettings, Operation } from '$lib/disk-types'
import { errorMessage, tildify } from '$lib/format'
import type { Column } from '$lib/table'
import { TableSort } from '$lib/table-sort.svelte'
import { human, job, readDisk, runJob } from './disk-client.svelte'

let { settings }: { settings: DiskSettings | null } = $props()

interface Step {
  name: string
  cmd: string[]
  cache?: string
  skip?: string
}

let rustSweep = $state(false)
let plan = $state<Step[]>([])
let refused = $state<DiskItem[]>([])
let last = $state<Operation[]>([])
let error = $state('')
let loaded = $state(false)

const sweepArg = $derived(rustSweep && !settings?.rustSweep ? ['--rust-sweep'] : [])

// The plan follows the sweep toggle; the last run's before/after comes from the operation log.
$effect(() => {
  readDisk('trim', '--dry-run', ...sweepArg)
    .then((r) => {
      plan = (r.data as { plan: Step[] }).plan
      refused = r.items ?? []
      error = ''
      loaded = true
    })
    .catch((e) => (error = errorMessage(e)))
})

$effect(() => {
  job.finished
  Promise.all([
    readDisk('log', '--op', 'trim', '--limit', '60'),
    readDisk('log', '--op', 'rust-sweep', '--limit', '60'),
  ])
    .then(([a, b]) => {
      const ops = [...((a.data as Operation[]) ?? []), ...((b.data as Operation[]) ?? [])]
      const run = ops
        .map((o) => o.start.run)
        .sort()
        .at(-1)
      last = ops.filter((o) => o.start.run === run)
    })
    .catch(() => (last = []))
})

/** A plan step or a refused item: one row type, both kinds of skip drawn dim. */
interface PlanRow {
  id: string
  name: string
  skip?: string
  command: string
  cache: string
  refused: boolean
}
const rows = $derived<PlanRow[]>([
  ...plan.map((s) => ({
    id: `step:${s.name}`,
    name: s.name,
    skip: s.skip,
    // A skipped step has no command; its reason goes there, where the column wraps.
    command: s.skip ?? s.cmd.join(' '),
    cache: s.cache ?? '',
    refused: false,
  })),
  ...refused.map((r) => ({
    id: `refused:${r.item}`,
    name: r.item,
    command: `refused — needs ${r.needs}`,
    cache: '',
    refused: true,
  })),
])
const planColumns: Column<PlanRow>[] = [
  { key: 'step', label: 'Step', wrap: true, cell: stepCell },
  { key: 'command', label: 'Command', wrap: true, cell: commandCell },
  { key: 'cache', label: 'Cache', hideBelow: 768, cell: cacheCell },
]

const cache = (o: Operation, k: string) => o.end?.details?.[k] as number | undefined
const bytes = (n: number | undefined) => (n === undefined ? '–' : human(n))
const sort = new TableSort<string>(null, ['before', 'after', 'freed'])
const lastColumns: Column<Operation>[] = [
  { key: 'step', label: 'Step', sort: (o) => o.start.item, cell: itemCell },
  {
    key: 'result',
    label: 'Result',
    sort: (o) => o.end?.outcome ?? 'interrupted',
    wrap: true,
    cell: resultCell,
  },
  {
    key: 'before',
    width: '6rem',
    label: 'Before',
    sort: (o) => cache(o, 'cacheBefore'),
    align: 'right',
    hideBelow: 768,
    cell: beforeCell,
  },
  {
    key: 'after',
    width: '6rem',
    label: 'After',
    sort: (o) => cache(o, 'cacheAfter'),
    align: 'right',
    hideBelow: 768,
    cell: afterCell,
  },
  {
    key: 'freed',
    width: '6rem',
    label: 'Freed',
    sort: (o) => o.end?.freed ?? 0,
    align: 'right',
    cell: freedCell,
  },
]
</script>

{#snippet stepCell(r: PlanRow)}{r.name}{#if r.skip} <Badge>skip</Badge>{/if}{/snippet}
{#snippet commandCell(r: PlanRow)}
  {@const cmd = !r.refused && !r.skip}
  <span class:mono={cmd} class:muted={cmd}>{r.command}</span>
{/snippet}
{#snippet cacheCell(r: PlanRow)}<span class="mono muted" title={r.cache}>{tildify(r.cache)}</span>{/snippet}
{#snippet itemCell(o: Operation)}{o.start.item}{/snippet}
{#snippet resultCell(o: Operation)}{o.end?.outcome ?? 'interrupted'}{o.end?.message ? ` — ${o.end.message}` : ''}{/snippet}
{#snippet beforeCell(o: Operation)}<span class="num">{bytes(cache(o, 'cacheBefore'))}</span>{/snippet}
{#snippet afterCell(o: Operation)}<span class="num">{bytes(cache(o, 'cacheAfter'))}</span>{/snippet}
{#snippet freedCell(o: Operation)}<span class="num">{human(o.end?.freed ?? 0)}</span>{/snippet}

<section>
  <div class="bar">
    <h2 class="t-h3">Trim</h2>
    <span class="t-caption muted">each installed tool trims its own cache</span>
    <span class="spacer"></span>
    <label class="t-small"><input type="checkbox" bind:checked={rustSweep} disabled={settings?.rustSweep} /> Rust sweep{settings?.rustSweep ? ' (always on)' : ''}</label>
    <Button variant="primary" disabled={!plan.length} onclick={() => runJob('trim', sweepArg)}>Run trim</Button>
  </div>
  <PageState loading={!loaded && !error} loadingText="Planning…" {error} empty={!loaded}>
    <Card flush>
      <Table label="Trim plan" {rows} key={(r) => r.id} columns={planColumns} dim={(r) => Boolean(r.skip) || r.refused} />
    </Card>
  </PageState>

  {#if last.length}
    <h3 class="t-small last">Last run · {last[0].start.at.slice(0, 16).replace('T', ' ')}</h3>
    <Card flush>
      <Table label="Last trim run" rows={last} key={(o) => o.start.id} columns={lastColumns} {sort} />
    </Card>
  {/if}
</section>

<style>
  .last {
    margin: var(--space-4) 0 var(--space-2);
    font-weight: 600;
  }
</style>
