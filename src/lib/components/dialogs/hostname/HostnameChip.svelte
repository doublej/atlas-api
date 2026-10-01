<script lang="ts">
import { page } from '$app/state'
import type { HostnameChipData } from '$lib/hostnames/types'
import { chips, hostOf } from './hostname.svelte'

/** The project's dev hostname as a link chip on its row; nothing when it has none. */
const { path }: { path: string } = $props()

const chip = $derived(
  path in chips
    ? chips[path]
    : (page.data.hostnames as Record<string, HostnameChipData> | undefined)?.[path],
)
</script>

{#if chip}
  <a
    class="chip"
    data-state={chip.state}
    href={chip.local}
    target="_blank"
    rel="noreferrer"
    title="{chip.local} — {chip.state}"
  >
    <span class="dot"></span>
    <span class="host">{hostOf(chip.local)}</span>
  </a>
{/if}

<style>
  /* Never wider than its line: the hostname ellipsizes, the dot stays. */
  .chip {
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 5px;
    height: 18px;
    padding: 0 6px;
    font-size: 11px;
    color: var(--color-muted);
    text-decoration: none;
    white-space: nowrap;
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-full);
  }

  .host {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip:hover {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }

  .dot {
    width: 6px;
    height: 6px;
    flex: none;
    border-radius: var(--radius-full);
    background: var(--status-clean);
  }

  .chip[data-state='syncing'] .dot,
  .chip[data-state='issuing'] .dot {
    background: var(--status-dirty);
  }

  .chip[data-state='failed'] .dot {
    background: var(--status-error);
  }
</style>
