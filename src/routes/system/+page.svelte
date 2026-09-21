<script lang="ts">
import { page } from '$app/state'
import type { PageData } from './$types'
import DaemonsSection from './DaemonsSection.svelte'
import HostsSection from './HostsSection.svelte'
import PortsSection from './PortsSection.svelte'
import ScannerSection from './ScannerSection.svelte'

let { data }: { data: PageData } = $props()

type Tab = 'hosts' | 'scanner' | 'daemons' | 'ports'

const unreachable = $derived(data.hostStates.filter((h) => h.status !== 'ok').length)
const failing = $derived(
  (data.daemons ?? []).filter((d) => d.state.status === 'error' || d.stale).length,
)
const collisions = $derived(data.audit?.collisions.length ?? 0)

// Each tab says in its menu line what it holds and whether it needs you, so the
// menu doubles as the system's status board.
const tabs = $derived<{ id: Tab; label: string; hint: string; alert: number }[]>([
  { id: 'hosts', label: 'Hosts', hint: `${data.hosts.length} machines`, alert: unreachable },
  { id: 'scanner', label: 'Scanner', hint: `walks ${data.config.maxDepth} levels deep`, alert: 0 },
  {
    id: 'daemons',
    label: 'Daemons',
    hint: `${data.daemons?.length ?? 0} registered`,
    alert: failing,
  },
  {
    id: 'ports',
    label: 'Ports',
    hint: collisions ? 'collisions found' : 'no collisions',
    alert: collisions,
  },
])

const active = $derived<Tab>(
  (tabs.find((t) => t.id === page.url.searchParams.get('tab'))?.id ?? 'hosts') as Tab,
)
</script>

<svelte:head>
  <title>System · atlas</title>
</svelte:head>

<main>
  <aside>
    <h1 class="t-h2">System</h1>
    <nav aria-label="System sections">
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
    {#if data.errors.length > 0}
      <ul class="failures t-small">
        {#each data.errors as e (e)}
          <li>{e}</li>
        {/each}
      </ul>
    {/if}

    {#if active === 'hosts'}
      <HostsSection hosts={data.hosts} states={data.hostStates} />
    {:else if active === 'scanner'}
      <ScannerSection config={data.config} />
    {:else if active === 'daemons'}
      <DaemonsSection daemons={data.daemons} />
    {:else}
      <PortsSection audit={data.audit} />
    {/if}
  </div>
</main>

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
