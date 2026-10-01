<script lang="ts">
import { page } from '$app/state'
import Notice from '$lib/components/feedback/Notice.svelte'
import SideNav, { type SideTab } from '$lib/components/SideNav.svelte'
import type { PageData } from './$types'
import DaemonsSection from './DaemonsSection.svelte'
import HostnameDoctorSection from './HostnameDoctorSection.svelte'
import HostsSection from './HostsSection.svelte'
import PortsSection from './PortsSection.svelte'
import ScannerSection from './ScannerSection.svelte'
import ServicesSection from './ServicesSection.svelte'

let { data }: { data: PageData } = $props()

type Tab = 'hosts' | 'scanner' | 'daemons' | 'services' | 'hostnames' | 'ports'

const unreachable = $derived(data.hostStates.filter((h) => h.status !== 'ok').length)
const failing = $derived(
  (data.daemons ?? []).filter((d) => d.state.status === 'error' || d.stale).length,
)
const down = $derived(data.services.filter((s) => s.mode === 'down').length)
const collisions = $derived(data.audit?.collisions.length ?? 0)

// Each tab says in its menu line what it holds and whether it needs you, so the
// menu doubles as the system's status board.
const tabs = $derived<(SideTab & { id: Tab })[]>([
  { id: 'hosts', label: 'Hosts', hint: `${data.hosts.length} machines`, alert: unreachable },
  { id: 'scanner', label: 'Scanner', hint: `walks ${data.config.maxDepth} levels deep`, alert: 0 },
  {
    id: 'daemons',
    label: 'Daemons',
    hint: `${data.daemons?.length ?? 0} registered`,
    alert: failing,
  },
  {
    id: 'services',
    label: 'Services',
    hint: `${data.services.length} hostnames`,
    alert: down,
  },
  { id: 'hostnames', label: 'Hostnames', hint: 'doctor: registry vs NAS', alert: 0 },
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
  <title>Atlas - System</title>
</svelte:head>

<SideNav title="System" label="System sections" {tabs} {active}>
  {#if data.errors.length > 0}
    <Notice tone="error">
      <ul>
        {#each data.errors as e (e)}
          <li>{e}</li>
        {/each}
      </ul>
    </Notice>
  {/if}

  {#if active === 'hosts'}
    <HostsSection hosts={data.hosts} states={data.hostStates} />
  {:else if active === 'scanner'}
    <ScannerSection config={data.config} />
  {:else if active === 'daemons'}
    <DaemonsSection daemons={data.daemons} />
  {:else if active === 'services'}
    <ServicesSection services={data.services} />
  {:else if active === 'hostnames'}
    <HostnameDoctorSection />
  {:else}
    <PortsSection audit={data.audit} />
  {/if}
</SideNav>
