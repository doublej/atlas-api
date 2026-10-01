<script lang="ts">
import { untrack } from 'svelte'
import { invalidateAll } from '$app/navigation'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { ScheduleStatus } from '$lib/disk-types'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import { ago } from './disk-client.svelte'

let { schedules }: { schedules: ScheduleStatus[] } = $props()

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WHAT = {
  scan: 'weekly scan for rebuildable folders; warns when space builds up',
  trim: 'weekly trim of developer-tool caches',
}

/** Per job: the day and time being edited, seeded once from `at` ("Sun 10:00"). */
let edits = $state(
  untrack(() =>
    Object.fromEntries(
      schedules.map((s) => [s.job, { day: s.at.split(' ')[0], time: s.at.split(' ')[1] }]),
    ),
  ),
)
let busy = $state('')
let error = $state('')

async function change(verb: 'enable' | 'disable' | 'set', s: ScheduleStatus) {
  busy = s.job
  error = ''
  const e = edits[s.job]
  try {
    await http.post('/api/disk/schedule', {
      verb,
      job: s.job,
      at: verb === 'disable' ? undefined : `${e.day} ${e.time}`,
    })
    await invalidateAll()
  } catch (err) {
    error = errorMessage(err)
  } finally {
    busy = ''
  }
}
</script>

<section>
  <div class="bar"><h2 class="t-h3">Schedules</h2><span class="t-caption muted">launchd jobs, run unattended under the approval policy</span></div>
  {#if error}<p class="t-small err">{error}</p>{/if}
  <div class="cards">
    {#each schedules as s (s.job)}
      <Card>
        <div class="bar">
          <h3 class="t-small name">{s.job}</h3>
          <Badge tone={s.enabled ? 'pos' : 'neutral'}>{s.enabled ? 'on' : 'off'}</Badge>
          {#if s.problem}<Badge tone="warn">{s.problem}</Badge>{/if}
          <span class="spacer"></span>
          <Button variant={s.enabled ? 'ghost' : 'primary'} disabled={busy === s.job} onclick={() => change(s.enabled ? 'disable' : 'enable', s)}>
            {s.enabled ? 'Turn off' : 'Turn on'}
          </Button>
        </div>
        <p class="t-caption muted">{WHAT[s.job]}</p>
        <div class="bar t-small">
          <select bind:value={edits[s.job].day}>
            {#each DAYS as d (d)}<option value={d}>{d}</option>{/each}
          </select>
          <input type="time" bind:value={edits[s.job].time} />
          <Button disabled={busy === s.job} onclick={() => change('set', s)}>Save time</Button>
        </div>
        <p class="t-caption">
          next {s.nextRun ? new Date(s.nextRun).toLocaleString() : '—'} · last
          {s.lastRun ? `${ago(s.lastRun.finishedAt)} → ${s.lastRun.result}` : 'never'}
        </p>
        {#if s.lastRun}<p class="t-caption mono muted">{s.lastRun.log}</p>{/if}
      </Card>
    {/each}
  </div>
</section>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-4);
  }

  .name {
    font-weight: 600;
    text-transform: capitalize;
  }
</style>
