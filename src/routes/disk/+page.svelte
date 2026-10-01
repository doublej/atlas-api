<script lang="ts">
import { onMount } from 'svelte'
import { page } from '$app/state'
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

const tabs = $derived<{ id: Tab; label: string; hint: string; alert: number }[]>([
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

<main class="disk">
  <aside>
    <h1 class="t-h2">Disk</h1>
    <p class="t-caption muted summary">
      <span class="num">{human(data.freeBytes)}</span> free<br />
      analysis {ago(data.analysis?.ranAt)} · scan {ago(data.scan?.ranAt)}
    </p>
    <nav aria-label="Disk sections">
      {#each tabs as tab (tab.id)}
        <a href="?tab={tab.id}" aria-current={active === tab.id ? 'page' : undefined}>
          <span class="label">
            {tab.label}
            {#if tab.alert > 0}<span class="alert num">{tab.alert}</span>{/if}
          </span>
          <span class="hint t-caption">{tab.hint}</span>
        </a>
      {/each}
    </nav>
  </aside>

  <div class="content">
    {#if data.errors.length || serious.length}
      <ul class="failures t-small">
        {#each data.errors as e (e)}
          <li>{e}</li>
        {/each}
        {#each serious as p (p.what)}
          <li>{p.severity === 'error' ? '✗' : '⚠'} {p.what} — <span class="mono">{p.fix}</span></li>
        {/each}
      </ul>
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
    {:else if data.settings}
      <DiskSettingsSection settings={data.settings} />
    {/if}
  </div>
</main>

<DiskJobPanel />

<style>
  main {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: var(--space-8);
    max-width: var(--col-max);
    margin: 0 auto;
    padding: var(--space-6) var(--page-pad) var(--space-16);
  }

  aside {
    position: sticky;
    top: calc(var(--nav-h) + var(--space-6));
    align-self: start;
  }

  aside h1 {
    margin-bottom: var(--space-2);
  }

  .summary {
    margin-bottom: var(--space-4);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  nav a {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    border-left: 2px solid transparent;
    color: var(--color-muted);
    text-decoration: none;
    transition: background var(--duration-fast) var(--ease-out);
  }

  nav a:hover {
    background: var(--color-card-2);
  }

  nav a[aria-current='page'] {
    color: var(--color-fg);
    background: var(--color-card);
    border-left-color: var(--color-accent);
  }

  .label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
    font-weight: 500;
  }

  .hint {
    color: var(--color-muted-2);
  }

  .alert {
    min-width: 16px;
    padding: 0 4px;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
    color: var(--color-neg);
    background: var(--color-neg-soft);
    border-radius: var(--radius-full);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--section-gap);
    min-width: 0;
  }

  .failures {
    list-style: none;
    margin: 0;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--color-neg-soft);
    color: var(--color-neg);
    overflow-wrap: anywhere;
  }

  @media (max-width: 768px) {
    main {
      grid-template-columns: 1fr;
      gap: var(--space-4);
      padding-inline: var(--space-4);
    }

    aside {
      position: static;
    }

    nav {
      flex-direction: row;
      overflow-x: auto;
    }

    nav a {
      border-left: none;
      border-bottom: 2px solid transparent;
    }

    nav a[aria-current='page'] {
      border-bottom-color: var(--color-accent);
    }

    .hint {
      display: none;
    }
  }
</style>
