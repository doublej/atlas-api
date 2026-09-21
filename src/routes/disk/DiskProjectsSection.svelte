<script lang="ts">
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Chip from '$lib/components/ui/Chip.svelte'
import type { Analysis, DiskSettings, ProjectRow } from '$lib/disk-types'
import DiskArchiveModal from './DiskArchiveModal.svelte'
import { ago, human, runJob, Selection } from './disk-client.svelte'

let { analysis, settings }: { analysis: Analysis | null; settings: DiskSettings | null } = $props()

const STATES = ['eligible', 'inactive', 'active'] as const
const TONE = { eligible: 'accent', inactive: 'neutral', active: 'pos' } as const

let filter = $state<ProjectRow['state'] | 'all'>('eligible')
let planning = $state(false)
const sel = new Selection()

const rows = $derived(
  (analysis?.projects ?? []).filter((p) => filter === 'all' || p.state === filter),
)
const ordered = $derived(rows.map((r) => r.id))
const chosen = $derived((analysis?.projects ?? []).filter((p) => sel.has(p.id)))

$effect(() => sel.keep((analysis?.projects ?? []).map((p) => p.id)))
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
        onchange={(e) => sel.setMany(ordered, e.currentTarget.checked)}
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
            <th>Project</th>
            <th class="right">Size</th>
            <th>State</th>
            <th class="right">Age</th>
            <th>Age set by</th>
            <th>Last commit</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as p (p.id)}
            <tr class="t-small" class:selected={sel.has(p.id)} onclick={(e) => sel.click(p.id, e, ordered)}>
              <td><input type="checkbox" aria-label="Select {p.id}" checked={sel.has(p.id)} onclick={(e) => e.stopPropagation()} onchange={(e) => sel.setMany([p.id], e.currentTarget.checked)} /></td>
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
  <DiskArchiveModal rows={chosen} {settings} onclose={() => (planning = false)} ondone={() => sel.setMany(sel.list, false)} />
{/if}
