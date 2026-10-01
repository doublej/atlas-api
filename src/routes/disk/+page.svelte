<script lang="ts">
import { onMount } from 'svelte'
import { page } from '$app/state'
import Notice from '$lib/components/feedback/Notice.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import SideNav, { type SideTab } from '$lib/components/SideNav.svelte'
import type { JobState } from '$lib/disk'
import { http } from '$lib/http'
import type { PageData } from './$types'
import DiskArchivesSection from './DiskArchivesSection.svelte'
import DiskCleanupSection from './DiskCleanupSection.svelte'
import DiskJobPanel from './DiskJobPanel.svelte'
import DiskLogSection from './DiskLogSection.svelte'
import DiskProjectsSection from './DiskProjectsSection.svelte'
import DiskSchedulesSection from './DiskSchedulesSection.svelte'
import DiskSettingsSection from './DiskSettingsSection.svelte'
import DiskTrimSection from './DiskTrimSection.svelte'
import { ago, follow, human, job } from './disk-client.svelte'
import './disk.css'

let { data }: { data: PageData } = $props()

type Tab = 'projects' | 'archives' | 'cleanup' | 'trim' | 'schedules' | 'log' | 'settings'

const eligible = $derived(data.analysis?.projects.filter((p) => p.state === 'eligible') ?? [])
const unverified = $derived(data.archives.filter((v) => !v.verified).length)
const scheduleProblems = $derived(data.schedules.filter((s) => s.problem).length)
const serious = $derived(data.problems.filter((p) => p.severity !== 'info'))

const tabs = $derived<(SideTab & { id: Tab })[]>([
  {
    id: 'projects',
    label: 'Projects',
    hint: `${eligible.length} eligible · ${human(eligible.reduce((n, p) => n + p.bytes, 0))}`,
    alert: 0,
  },
  {
    id: 'archives',
    label: 'Archives',
    hint: `${data.archives.length} versions`,
    alert: unverified,
  },
  {
    id: 'cleanup',
    label: 'Cleanup',
    hint: data.scan ? `${human(data.scan.totalBytes)} reclaimable` : 'no scan yet',
    alert: 0,
  },
  { id: 'trim', label: 'Trim', hint: 'tool caches', alert: 0 },
  {
    id: 'schedules',
    label: 'Schedules',
    hint: `${data.schedules.filter((s) => s.enabled).length} of ${data.schedules.length} on`,
    alert: scheduleProblems,
  },
  { id: 'log', label: 'Log', hint: 'operations', alert: data.pending.length },
  { id: 'settings', label: 'Settings', hint: 'thresholds & rules', alert: 0 },
])

const active = $derived<Tab>(
  (tabs.find((t) => t.id === page.url.searchParams.get('tab'))?.id ?? 'projects') as Tab,
)

// A reload picks a running job back up; the CLI's lock means there is at most one.
onMount(async () => {
  if (job.current) return
  const { jobs } = await http.get<{ jobs: JobState[] }>('/api/disk/jobs')
  const running = jobs.find((j) => !j.done)
  if (running) follow(running)
})
</script>

<svelte:head>
  <title>Atlas - Disk</title>
</svelte:head>

<SideNav title="Disk" label="Disk sections" {tabs} {active} class="disk">
  {#snippet summary()}
    <span class="num">{human(data.freeBytes)}</span> free<br />
    analysis {ago(data.analysis?.ranAt)} · scan {ago(data.scan?.ranAt)}
  {/snippet}

  {#if data.errors.length || serious.length}
    <Notice tone="error">
      <ul>
        {#each data.errors as e (e)}
          <li>{e}</li>
        {/each}
        {#each serious as p (p.what)}
          <li>{p.severity === 'error' ? '✗' : '⚠'} {p.what} — <span class="mono">{p.fix}</span></li>
        {/each}
      </ul>
    </Notice>
  {/if}

  {#if active === 'projects'}
    <DiskProjectsSection analysis={data.analysis} settings={data.settings} />
  {:else if active === 'archives'}
    <DiskArchivesSection archives={data.archives} settings={data.settings} />
  {:else if active === 'cleanup'}
    <DiskCleanupSection scan={data.scan} />
  {:else if active === 'trim'}
    <DiskTrimSection settings={data.settings} />
  {:else if active === 'schedules'}
    <DiskSchedulesSection schedules={data.schedules} />
  {:else if active === 'log'}
    <DiskLogSection pending={data.pending} />
  {:else}
    <PageState error={data.settings ? '' : 'The disk settings could not be read.'}>
      {#if data.settings}<DiskSettingsSection settings={data.settings} />{/if}
    </PageState>
  {/if}
</SideNav>

<DiskJobPanel />
