<script lang="ts">
import Notice from '$lib/components/feedback/Notice.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { PageData } from './$types'

let { services }: { services: PageData['services'] } = $props()

const tone = { direct: 'pos', bridge: 'info', down: 'neg' } as const
const failing = $derived(services.filter((s) => s.error))
</script>

<section>
  <header>
    <h2 class="t-h3">Services</h2>
    <span class="t-small muted">
      permanent local web UIs from <code class="mono">shared/services.json</code>, re-synced every
      60s
    </span>
  </header>

  <PageState
    empty={services.length === 0}
    emptyText="Not synced yet — the first sync runs when the daemon starts."
  >
    {#if failing.length}
      <Notice tone="error">
        <ul>
          {#each failing as s (s.slug)}<li><code class="mono">{s.slug}</code>: {s.error}</li>{/each}
        </ul>
      </Notice>
    {/if}
    <Card>
      <ul class="list">
        {#each services as s (s.slug)}
          <li class="t-small">
            <code class="mono">{s.slug}</code>
            <span>{s.name}</span>
            <span class="mono num muted-2">:{s.port}</span>
            <Badge tone={tone[s.mode]}>{s.mode}</Badge>
            {#if s.local}
              <a class="mono" href={s.local} target="_blank" rel="noreferrer">{s.local}</a>
            {/if}
          </li>
        {/each}
      </ul>
    </Card>
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

  .list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    overflow-wrap: anywhere;
  }
</style>
