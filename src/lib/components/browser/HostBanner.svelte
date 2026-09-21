<script lang="ts">
import type { HostState } from '$lib/scanner'
import { getHostById } from '$shared/hosts'

interface Props {
  /** Only the hosts whose last scan did not come back `ok`. */
  hosts: HostState[]
}

const { hosts }: Props = $props()

const label = (id: string): string => getHostById(id)?.label ?? id
</script>

<!-- A host that answered its last scan badly is the difference between "that project is gone"
     and "that machine is off" — the one thing the catalog must never swallow silently. -->
{#if hosts.length > 0}
  <div class="degraded">
    {#each hosts as host (host.id)}
      <p class="t-small">
        <strong>{label(host.id)}</strong>
        {host.status} — showing its last scan of {host.projectCount} projects from
        {new Date(host.scannedAt).toLocaleString()}.{host.error ? ` ${host.error}` : ''}
      </p>
    {/each}
  </div>
{/if}

<style>
  .degraded {
    margin-bottom: var(--section-gap);
    padding: var(--space-3);
    background: var(--color-warn-soft);
    border: var(--hairline) solid var(--color-warn);
    border-radius: var(--radius-md);
  }

  .degraded p {
    margin: 0;
    color: var(--color-fg);
  }
</style>
