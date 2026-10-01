<script lang="ts">
import { page } from '$app/state'
import Notice from '$lib/components/feedback/Notice.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Chip from '$lib/components/ui/Chip.svelte'
import { tildify } from '$lib/format'
import type { PageData } from './$types'
import AdoptionTab from './AdoptionTab.svelte'
import EffectsTab from './EffectsTab.svelte'
import { buildRail } from './rail'
import SchemaTab from './SchemaTab.svelte'
import TemplateRail from './TemplateRail.svelte'

let { data }: { data: PageData } = $props()

type Tab = 'effects' | 'schema' | 'consistency' | 'adoption'

const railItems = $derived(buildRail(data.templates, data.errors, data.lint))

let selectedId = $state<string | null>(null)
$effect(() => {
  if (selectedId !== null || railItems.length === 0) return
  const requested = page.url.searchParams.get('t')
  selectedId = requested && railItems.some((i) => i.id === requested) ? requested : railItems[0].id
})
const selected = $derived(railItems.find((i) => i.id === selectedId) ?? null)

let tab = $state<Tab>('effects')

const selectedLint = $derived(selected ? data.lint.filter((l) => l.template === selected.id) : [])
const selectedAdoption = $derived(selected ? (data.adoption[selected.id] ?? null) : null)

function select(id: string) {
  selectedId = id
  tab = 'effects'
}
</script>

<svelte:head>
  <title>Atlas - Templates</title>
</svelte:head>

<div class="layout">
  <TemplateRail items={railItems} adoption={data.adoption} {selectedId} onselect={select} />

  <main class="detail">
    <PageState
      error={data.failures.length ? data.failures.join(' · ') : null}
      empty={railItems.length === 0}
      emptyText="No cookiecutter templates under {tildify(data.templatesDir)}."
    >
      {#if selected?.error}
        <Card>
          <h2>{selected.id}</h2>
          <Notice tone="error">{selected.error.message}</Notice>
          <p class="path">{selected.error.path}</p>
        </Card>
      {:else if selected?.template}
        {@const t = selected.template}
        <div class="detail-header">
          <h2>{selected.id}</h2>
          {#if t.version}<Badge tone="neutral">v{t.version}</Badge>{/if}
          <span class="path">{t.path}</span>
        </div>
        <p class="description">{t.description}</p>

        <div class="tabs">
          <Chip pressed={tab === 'effects'} onclick={() => (tab = 'effects')}>Effects</Chip>
          <Chip pressed={tab === 'schema'} onclick={() => (tab = 'schema')}>Schema</Chip>
          <Chip pressed={tab === 'consistency'} onclick={() => (tab = 'consistency')}>
            Consistency
            {#if selectedLint.length > 0}<span class="badge-count">{selectedLint.length}</span>{/if}
          </Chip>
          <Chip pressed={tab === 'adoption'} onclick={() => (tab = 'adoption')}>
            Adoption
            {#if selectedAdoption}<span class="badge-count">{selectedAdoption.totalCount}</span>{/if}
          </Chip>
        </div>

        {#if tab === 'effects'}
          <EffectsTab variables={t.variables} />
        {:else if tab === 'schema'}
          <SchemaTab variables={t.variables} />
        {:else if tab === 'consistency'}
          <div class="lint-list">
            {#if selectedLint.length === 0}
              <p class="t-small muted">No lint findings.</p>
            {:else}
              {#each selectedLint as l, i (i)}
                <div class="lint-entry">
                  <Badge tone={l.level === 'error' ? 'neg' : l.level === 'warn' ? 'warn' : 'info'}>
                    {l.level}
                  </Badge>
                  <span class="lint-code">{l.code}</span>
                  <span>{l.message}</span>
                </div>
              {/each}
            {/if}
          </div>
        {:else}
          <AdoptionTab adoption={selectedAdoption} updateScaffoldTool={data.updateScaffoldTool} />
        {/if}
      {/if}
    </PageState>
  </main>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: 260px 1fr;
    height: 100%;
    min-height: 100vh;
    background: var(--color-bg);
    color: var(--color-fg);
  }

  .detail {
    padding: var(--space-6);
    overflow-y: auto;
    min-width: 0;
  }

  .detail-header {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-bottom: var(--space-1);
  }
  h2 {
    font-size: 18px;
    font-weight: 600;
  }

  .path {
    color: var(--color-muted);
    font-size: 12px;
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }
  .description {
    color: var(--color-muted);
    margin-bottom: var(--space-4);
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .badge-count {
    margin-left: var(--space-1);
    font-size: 10px;
    opacity: 0.8;
  }

  .lint-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .lint-entry {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
  }
  .lint-code {
    font-family: var(--font-mono);
    color: var(--color-muted);
  }

  @media (max-width: 768px) {
    .layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
      min-height: 0;
    }
    .detail {
      padding: var(--space-4);
    }
  }
</style>
