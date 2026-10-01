<script lang="ts">
import Badge from '$lib/components/ui/Badge.svelte'
import { bytes } from '$lib/processes/display'
import type { SystemMemory, TopEntry } from '$lib/processes/types'

/** The machine at a glance: memory pressure, swap, load and who uses the most. */
const { system, onpick }: { system: SystemMemory; onpick: (name: string) => void } = $props()

const TONE = { normal: 'pos', warn: 'warn', critical: 'neg' } as const
const swapShare = $derived(system.swapTotal ? system.swapUsed / system.swapTotal : 0)
</script>

{#snippet top(label: string, entries: TopEntry[], value: (t: TopEntry) => string)}
  <div class="top">
    <span class="t-caption muted">{label}</span>
    {#each entries as t (t.id)}
      <button type="button" class="t-caption" title="Show {t.name}" onclick={() => onpick(t.name)}>
        {t.name} <span class="num muted">{value(t)}</span>
      </button>
    {/each}
  </div>
{/snippet}

<section class="strip" aria-label="Memory and load">
  <div class="facts t-small">
    <Badge tone={TONE[system.pressure]} dot="currentColor">memory {system.pressure}</Badge>
    <span>
      <span class="num">{system.freePercent}%</span> free of
      <span class="num">{bytes(system.memTotal)}</span>
    </span>
    <span class:warn={swapShare > 0.8}>
      swap <span class="num">{bytes(system.swapUsed)}</span> /
      <span class="num">{bytes(system.swapTotal)}</span>
    </span>
    <span>
      load <span class="num">{system.loadAvg.map((n) => n.toFixed(1)).join(' · ')}</span>
    </span>
  </div>
  {@render top('Most memory', system.topByRss, (t) => bytes(t.rss))}
  {@render top('Most CPU', system.topByCpu, (t) => `${t.cpu.toFixed(0)}%`)}
</section>

<style>
  .strip {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--color-card);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .facts,
  .top {
    display: flex;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    flex-wrap: wrap;
  }

  .top {
    gap: var(--space-1) var(--space-2);
  }

  .top > span {
    min-width: 6.5rem;
  }

  .top button {
    padding: 1px var(--space-2);
    color: var(--color-fg-2);
    background: var(--color-card-2);
    border: var(--hairline) solid var(--color-border-soft);
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .top button:hover {
    color: var(--color-fg);
    background: var(--color-hover);
  }

  .warn {
    color: var(--color-warn);
  }
</style>
