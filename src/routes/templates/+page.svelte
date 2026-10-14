<script lang="ts">
import { page } from '$app/state'
import FeatureHeader from '$lib/components/FeatureHeader.svelte'
import Notice from '$lib/components/feedback/Notice.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import { plateIndex } from '$lib/components/SideNav.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Card from '$lib/components/ui/Card.svelte'
import { tildify } from '$lib/format'
import type { PageData } from './$types'
import AdoptionTab from './AdoptionTab.svelte'
import EffectsTab from './EffectsTab.svelte'
import { buildRail } from './rail'
import SchemaTab from './SchemaTab.svelte'
import TemplateRail from './TemplateRail.svelte'

let { data }: { data: PageData } = $props()

const TABS = [
  ['effects', 'Effects'],
  ['schema', 'Schema'],
  ['consistency', 'Consistency'],
  ['adoption', 'Adoption'],
] as const
type Tab = (typeof TABS)[number][0]

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
const counts = $derived<Partial<Record<Tab, number>>>({
  consistency: selectedLint.length || undefined,
  adoption: selectedAdoption?.totalCount,
})

function select(id: string) {
  selectedId = id
  tab = 'effects'
}

// Arrow keys move between tabs (the ARIA tabs pattern); only the open tab sits in the Tab order.
function stepTab(e: KeyboardEvent) {
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
  if (!step) return
  const i = TABS.findIndex(([id]) => id === tab)
  tab = TABS[(i + step + TABS.length) % TABS.length][0]
  document.getElementById(`tab-${tab}`)?.focus()
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
          <h2 class="error-title">{selected.id}</h2>
          <Notice tone="error">{selected.error.message}</Notice>
          <p class="path">{selected.error.path}</p>
        </Card>
      {:else if selected?.template}
        {@const t = selected.template}
        <FeatureHeader
          eyebrow="Template · {t.family}"
          title={t.name}
          lede={t.description}
          source={tildify(t.path)}
        >
          {#snippet meta()}
            {#if t.version}<span>v{t.version}</span>·{/if}<span>{t.variables.length} variables</span>
            {#if selectedAdoption}·<span>{selectedAdoption.totalCount} projects</span>{/if}
          {/snippet}
        </FeatureHeader>

        <div class="tabs" role="tablist" aria-label="Template views">
          {#each TABS as [id, label], i (id)}
            <button
              type="button"
              role="tab"
              id="tab-{id}"
              class="tab"
              aria-selected={tab === id}
              aria-controls="tab-panel"
              tabindex={tab === id ? 0 : -1}
              onclick={() => (tab = id)}
              onkeydown={stepTab}
            >
              <span class="idx num" aria-hidden="true">{plateIndex(i)}</span>
              {label}
              {#if counts[id] !== undefined}<span class="badge-count">{counts[id]}</span>{/if}
            </button>
          {/each}
        </div>

        <div id="tab-panel" role="tabpanel" aria-labelledby="tab-{tab}">
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
        </div>
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

  .error-title {
    margin-bottom: var(--space-3);
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 400;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  .path {
    color: var(--color-muted);
    font-size: 12px;
    font-family: var(--font-mono);
    overflow-wrap: anywhere;
  }

  /* The SideNav's index laid on its side: numbered text tabs on one hairline rail, the open tab
     underlined in the accent. */
  .tabs {
    position: relative;
    display: flex;
    overflow-x: auto;
    margin-bottom: var(--space-4);
  }

  .tabs::before {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: var(--hairline);
    background: var(--color-border-strong);
  }

  .tab {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    color: var(--color-muted);
    background: none;
    border: none;
    cursor: pointer;
    transition: color var(--duration-fast) var(--ease-out);
  }

  .tab::before {
    content: '';
    position: absolute;
    inset: auto var(--space-2) 0;
    height: 2px;
    border-radius: 1px;
    background: transparent;
    transition: background var(--duration-fast) var(--ease-out);
  }

  /* The first tab starts on the plate's left edge, under the title. */
  .tab:first-child {
    padding-left: 0;
  }

  .tab:first-child::before {
    left: 0;
  }

  .tab:focus-visible {
    outline-offset: -2px;
  }

  .tab:hover,
  .tab[aria-selected='true'] {
    color: var(--color-fg);
  }

  .tab:hover::before {
    background: var(--color-border-strong);
  }

  .tab[aria-selected='true']::before {
    background: var(--color-accent);
  }

  .idx {
    font-size: 11px;
    color: var(--color-muted-2);
  }

  [aria-selected='true'] .idx {
    color: var(--color-accent);
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
