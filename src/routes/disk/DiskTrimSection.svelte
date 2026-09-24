<script lang="ts">
import SortHeader from '$lib/components/table/SortHeader.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { DiskItem } from '$lib/disk'
import type { DiskSettings, Operation } from '$lib/disk-types'
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

const sweepArg = $derived(rustSweep && !settings?.rustSweep ? ['--rust-sweep'] : [])

// The plan follows the sweep toggle; the last run's before/after comes from the operation log.
$effect(() => {
  readDisk('trim', '--dry-run', ...sweepArg)
    .then((r) => {
      plan = (r.data as { plan: Step[] }).plan
      refused = r.items ?? []
      error = ''
    })
    .catch((e: Error) => (error = e.message))
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

const cache = (o: Operation, k: string) => o.end?.details?.[k] as number | undefined
const sort = new TableSort<'step' | 'result' | 'before' | 'after' | 'freed'>(null, [
  'before',
  'after',
  'freed',
])
const lastSorted = $derived(
  sort.apply(last, {
    step: (o) => o.start.item,
    result: (o) => o.end?.outcome ?? 'interrupted',
    before: (o) => cache(o, 'cacheBefore'),
    after: (o) => cache(o, 'cacheAfter'),
    freed: (o) => o.end?.freed ?? 0,
  }),
)
</script>

<section>
  <div class="bar">
    <h2 class="t-h3">Trim</h2>
    <span class="t-caption muted">each installed tool trims its own cache</span>
    <span class="spacer"></span>
    <label class="t-small"><input type="checkbox" bind:checked={rustSweep} disabled={settings?.rustSweep} /> Rust sweep{settings?.rustSweep ? ' (always on)' : ''}</label>
    <Button variant="primary" disabled={!plan.length} onclick={() => runJob('trim', sweepArg)}>Run trim</Button>
  </div>
  {#if error}<p class="t-small err">{error}</p>{/if}

  <Card flush>
    <div class="scroll">
      <table>
        <thead><tr class="t-caption"><th>Step</th><th>Command</th><th>Cache</th></tr></thead>
        <tbody>
          {#each plan as s (s.name)}
            <tr class="t-small" class:dim={s.skip}>
              <td>{s.name}{#if s.skip} <Badge>skip: {s.skip}</Badge>{/if}</td>
              <td class="mono muted">{s.cmd.join(' ')}</td>
              <td class="mono muted">{s.cache ?? ''}</td>
            </tr>
          {/each}
          {#each refused as r (r.item)}
            <tr class="t-small dim"><td>{r.item}</td><td colspan="2">refused — needs {r.needs}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>

  {#if last.length}
    <h3 class="t-small last">Last run · {last[0].start.at.slice(0, 16).replace('T', ' ')}</h3>
    <Card flush>
      <div class="scroll">
        <table>
          <thead>
            <tr class="t-caption">
              <SortHeader {sort} key="step" label="Step" />
              <SortHeader {sort} key="result" label="Result" />
              <SortHeader {sort} key="before" label="Before" class="right" />
              <SortHeader {sort} key="after" label="After" class="right" />
              <SortHeader {sort} key="freed" label="Freed" class="right" />
            </tr>
          </thead>
          <tbody>
            {#each lastSorted as o (o.start.id)}
              <tr class="t-small">
                <td>{o.start.item}</td>
                <td>{o.end?.outcome ?? 'interrupted'}{o.end?.message ? ` — ${o.end.message}` : ''}</td>
                <td class="num right">{cache(o, 'cacheBefore') === undefined ? '–' : human(cache(o, 'cacheBefore') ?? 0)}</td>
                <td class="num right">{cache(o, 'cacheAfter') === undefined ? '–' : human(cache(o, 'cacheAfter') ?? 0)}</td>
                <td class="num right">{human(o.end?.freed ?? 0)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  {/if}
</section>

<style>
  .last {
    margin: var(--space-4) 0 var(--space-2);
    font-weight: 600;
  }
</style>
