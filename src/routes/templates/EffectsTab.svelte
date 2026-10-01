<script lang="ts">
import Badge from '$lib/components/ui/Badge.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { TemplateVariable } from '$lib/templates'
import { referencesByFile } from './rail'

let { variables }: { variables: TemplateVariable[] } = $props()

const externalSideEffect: Record<string, string> = {
  include_tracking: 'creates a website record on the live Umami instance when set to "y"',
}
const allocationNote: Record<string, string> = {
  port: 'declared default is overridden by /api/ports/allocate at generation time',
}
</script>

<div class="variables">
  {#each variables as v (v.name)}
    <Card>
      <div class="var-head">
        <span class="var-name">{v.name}</span>
        {#if v.isDerived}<Badge tone="info">derived</Badge>{/if}
        {#if externalSideEffect[v.name]}<Badge tone="warn">external side effect</Badge>{/if}
        {#if allocationNote[v.name]}<Badge tone="accent">allocated</Badge>{/if}
      </div>
      {#if externalSideEffect[v.name]}
        <p class="note">{externalSideEffect[v.name]}</p>
      {/if}
      {#if allocationNote[v.name]}
        <p class="note">{allocationNote[v.name]}</p>
      {/if}
      {#if v.references.length === 0}
        <p class="note muted">no references found in template body</p>
      {:else}
        <ul class="refs">
          {#each referencesByFile(v.references) as [file, kinds] (file)}
            <li>
              <span class="ref-file">{file}</span>
              {#each kinds as kind (kind)}
                <Badge tone="neutral">{kind}</Badge>
              {/each}
            </li>
          {/each}
        </ul>
      {/if}
    </Card>
  {/each}
</div>

<style>
  .variables {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .var-head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .var-name {
    font-family: var(--font-mono);
    font-weight: 600;
  }
  .note {
    font-size: 12px;
    color: var(--color-fg-2);
    margin-bottom: var(--space-1);
  }
  .note.muted {
    color: var(--color-muted);
  }
  .refs {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .refs li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: 12px;
  }
  .ref-file {
    font-family: var(--font-mono);
    color: var(--color-fg-2);
    overflow-wrap: anywhere;
  }
</style>
