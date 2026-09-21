<script lang="ts">
import type { PageData } from './$types'
import DaemonsSection from './DaemonsSection.svelte'
import HostsSection from './HostsSection.svelte'
import PortsSection from './PortsSection.svelte'
import ScannerSection from './ScannerSection.svelte'

let { data }: { data: PageData } = $props()
</script>

<svelte:head>
  <title>System · atlas</title>
</svelte:head>

<main>
  <header>
    <h1 class="t-h2">System</h1>
    <p class="t-small muted">
      The machine-level half of the console: which hosts atlas catalogs, how deep it walks them,
      what is running, and which ports are contested.
    </p>
  </header>

  {#if data.errors.length > 0}
    <ul class="failures t-small">
      {#each data.errors as e (e)}
        <li>{e}</li>
      {/each}
    </ul>
  {/if}

  <HostsSection hosts={data.hosts} states={data.hostStates} />
  <ScannerSection config={data.config} />
  <DaemonsSection daemons={data.daemons} />
  <PortsSection audit={data.audit} />
</main>

<style>
  main {
    max-width: var(--col-max);
    margin: 0 auto;
    padding: var(--space-6) var(--page-pad) var(--space-16);
    display: flex;
    flex-direction: column;
    gap: var(--section-gap);
  }

  header h1 {
    margin-bottom: var(--space-1);
  }
  header p {
    max-width: 68ch;
  }

  .failures {
    list-style: none;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--color-neg-soft);
    color: var(--color-neg);
  }
</style>
