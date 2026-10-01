<script lang="ts">
import PageState from '$lib/components/feedback/PageState.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { PageData } from './$types'

let { audit }: { audit: PageData['audit'] } = $props()
</script>

<section>
  <header>
    <h2 class="t-h3">Ports</h2>
    <span class="t-small muted">
      report-only, this machine only — atlas never backfills a port from here
    </span>
  </header>

  <PageState error={audit ? null : 'The scan failed, so no audit could be run.'} empty={!audit}>
    {#if audit}
      <Card>
        <h3 class="t-small heading">Collisions</h3>
        {#if audit.collisions.length === 0}
          <p class="t-small ok">
            <Badge tone="pos" dot="currentColor">clear</Badge>
            No port collisions — every declared port is claimed by exactly one daemon or project.
          </p>
        {:else}
          <ul class="collisions">
            {#each audit.collisions as c (c.port)}
              <li>
                <span class="mono num port">{c.port}</span>
                <div class="sources">
                  {#each c.sources as s (s.kind + s.label)}
                    <div class="t-caption">
                      <Badge tone={s.kind === 'daemon' ? 'info' : 'neutral'}>{s.kind}</Badge>
                      <span>{s.name}</span>
                      <code class="mono muted-2">{s.label}</code>
                    </div>
                  {/each}
                </div>
              </li>
            {/each}
          </ul>
        {/if}

        <h3 class="t-small heading spaced">
          Unmanaged listeners
          <span class="t-caption muted">({audit.unmanaged.length})</span>
        </h3>
        <p class="t-caption muted note">
          Port-bearing frameworks with no declared port. Harmless until two of them pick the same
          default — <code class="mono">POST /api/run</code> assigns one on first launch.
        </p>
        {#if audit.unmanaged.length === 0}
          <p class="t-small ok">Every port-bearing project declares a port.</p>
        {:else}
          <ul class="unmanaged">
            {#each audit.unmanaged as u (u.path)}
              <li class="t-caption">
                <code class="mono">{u.relativePath}</code>
                <Badge tone="neutral">{u.framework}</Badge>
              </li>
            {/each}
          </ul>
        {/if}
      </Card>
    {/if}
  </PageState>
</section>

<style>
  header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }

  .heading {
    font-weight: 600;
    margin-bottom: var(--space-2);
  }
  .heading.spaced {
    padding-top: var(--space-4);
    margin-top: var(--space-4);
    border-top: var(--hairline) solid var(--color-border-soft);
  }
  .note {
    max-width: 62ch;
    margin-bottom: var(--space-3);
  }

  .ok {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    color: var(--color-fg-2);
  }
  .collisions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
  }
  .collisions li {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--color-neg-soft);
  }
  .port {
    font-size: 15px;
    font-weight: 600;
    color: var(--color-neg);
  }
  .sources div {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .unmanaged {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-1) var(--space-3);
    list-style: none;
  }
  .unmanaged li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    overflow-wrap: anywhere;
  }
</style>
