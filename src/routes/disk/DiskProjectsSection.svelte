<script lang="ts">
import SortHeader from '$lib/components/table/SortHeader.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Chip from '$lib/components/ui/Chip.svelte'
import type { Analysis, DiskSettings, ProjectRow } from '$lib/disk-types'
import { Selection } from '$lib/selection.svelte'
import { TableSort } from '$lib/table-sort.svelte'
import DiskArchiveModal from './DiskArchiveModal.svelte'
import { ago, human, runJob } from './disk-client.svelte'

let { analysis, settings }: { analysis: Analysis | null; settings: DiskSettings | null } = $props()

const STATES = ['eligible', 'inactive', 'active'] as const
const TONE = { eligible: 'accent', inactive: 'neutral', active: 'pos' } as const

let filter = $state<ProjectRow['state'] | 'all'>('eligible')
let planning = $state(false)
const sel = new Selection()
const sort = new TableSort<'id' | 'size' | 'state' | 'age' | 'ageFile' | 'commit' | 'flags'>(null, [
  'size',
  'age',
  'commit',
  'flags',
])

const rows = $derived(
  sort.apply(
    (analysis?.projects ?? []).filter((p) => filter === 'all' || p.state === filter),
    {
      id: (p) => p.id,
      size: (p) => p.bytes,
      state: (p) => STATES.indexOf(p.state),
      age: (p) => p.ageDays,
      ageFile: (p) => p.ageFile,
      commit: (p) => p.lastCommit,
      flags: (p) => Number(p.dirty) + Number(p.push === 'unpushed'),
    },
  ),
)
const ordered = $derived(rows.map((r) => r.id))
const chosen = $derived((analysis?.projects ?? []).filter((p) => sel.has(p.id)))

$effect(() => sel.prune((analysis?.projects ?? []).map((p) => p.id)))
</script>

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
  <div class="bar">
    <Chip pressed={filter === 'all'} onclick={() => (filter = 'all')}>all</Chip>
    {#each STATES as s (s)}
      <Chip pressed={filter === s} onclick={() => (filter = s)}>{s}</Chip>
    {/each}
    <label class="t-caption muted">
      <input
        type="checkbox"
        checked={ordered.length > 0 && ordered.every((k) => sel.has(k))}
        onchange={(e) => sel.set(ordered, e.currentTarget.checked)}
      />
      select all shown
    </label>
  </div>

  <Card flush>
    <div class="scroll">
      <table>
        <thead>
          <tr class="t-caption">
            <th></th>
            <SortHeader {sort} key="id" label="Project" />
            <SortHeader {sort} key="size" label="Size" class="right" />
            <SortHeader {sort} key="state" label="State" />
            <SortHeader {sort} key="age" label="Age" class="right" />
            <SortHeader {sort} key="ageFile" label="Age set by" />
            <SortHeader {sort} key="commit" label="Last commit" />
            <SortHeader {sort} key="flags" label="Flags" />
          </tr>
        </thead>
        <tbody>
          {#each rows as p (p.id)}
            <tr class="t-small" class:selected={sel.has(p.id)} onclick={(e) => sel.click(p.id, e, ordered)}>
              <td><input type="checkbox" aria-label="Select {p.id}" checked={sel.has(p.id)} onclick={(e) => e.stopPropagation()} onchange={(e) => sel.set([p.id], e.currentTarget.checked)} /></td>
              <td class="mono">{p.id}</td>
              <td class="num right">{human(p.bytes)}</td>
              <td><Badge tone={TONE[p.state]}>{p.state}</Badge></td>
              <td class="num right">{p.ageDays === null ? '–' : `${p.ageDays}d`}</td>
              <td class="mono muted">{p.ageFile ?? 'no edit files'}</td>
              <td class="num muted">{p.lastCommit?.slice(0, 10) ?? '–'}</td>
              <td>
                {#if p.dirty}<Badge tone="warn">uncommitted</Badge>{/if}
                {#if p.push === 'unpushed'}<Badge tone="warn">unpushed</Badge>{/if}
                {#if p.push === 'unknown'}<Badge title="no remote, or it couldn't be compared">push?</Badge>{/if}
              </td>
            </tr>
          {:else}
            <tr><td colspan="8" class="t-small muted">No projects {filter === 'all' ? '' : `in state ${filter}`} — Rescan to analyse.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
</section>

{#if planning && settings}
  <DiskArchiveModal rows={chosen} {settings} onclose={() => (planning = false)} ondone={() => sel.clear()} />
{/if}
