<script lang="ts">
import Badge from '$lib/components/ui/Badge.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Chip from '$lib/components/ui/Chip.svelte'
import type { LintEntry } from '$lib/template-lint'
import type { DiscoveredTemplate, TemplateError, VariableReference } from '$lib/templates'

let { data }: { data: { templates: DiscoveredTemplate[]; errors: TemplateError[]; lint: LintEntry[] } } =
  $props()

type Tab = 'effects' | 'schema' | 'consistency'

interface RailItem {
  id: string
  family: string
  name: string
  template: DiscoveredTemplate | null
  error: TemplateError | null
  status: 'error' | 'warn' | 'clean'
}

const railItems = $derived.by((): RailItem[] => {
  const items: RailItem[] = []
  for (const t of data.templates) {
    const id = `${t.family}/${t.name}`
    const hasWarn = data.lint.some((l) => l.template === id && l.level !== 'info')
    items.push({
      id,
      family: t.family,
      name: t.name,
      template: t,
      error: null,
      status: hasWarn ? 'warn' : 'clean',
    })
  }
  for (const e of data.errors) {
    items.push({
      id: `${e.family}/${e.name}`,
      family: e.family,
      name: e.name,
      template: null,
      error: e,
      status: 'error',
    })
  }
  return items.sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name))
})

const families = $derived([...new Set(railItems.map((i) => i.family))].sort())

let selectedId = $state<string | null>(null)
$effect(() => {
  if (selectedId === null && railItems.length > 0) selectedId = railItems[0].id
})
const selected = $derived(railItems.find((i) => i.id === selectedId) ?? null)

let tab = $state<Tab>('effects')

const selectedLint = $derived(
  selected ? data.lint.filter((l) => l.template === selected.id) : [],
)

const externalSideEffect: Record<string, string> = {
  include_tracking: 'creates a website record on the live Umami instance when set to "y"',
}
const allocationNote: Record<string, string> = {
  port: 'declared default is overridden by /api/ports/allocate at generation time',
}

function referencesByFile(refs: VariableReference[]): Map<string, VariableReference['kind'][]> {
  const map = new Map<string, VariableReference['kind'][]>()
  for (const r of refs) {
    const kinds = map.get(r.file) ?? []
    kinds.push(r.kind)
    map.set(r.file, kinds)
  }
  return map
}
</script>

<svelte:head>
  <title>Scaffold Registry</title>
</svelte:head>

<div class="layout">
  <aside class="rail">
    <div class="rail-header">
      <h1>Templates</h1>
      <span class="count">{railItems.length}</span>
    </div>
    {#each families as family (family)}
      <div class="family">
        <div class="family-label">{family}</div>
        {#each railItems.filter((i) => i.family === family) as item (item.id)}
          <button
            type="button"
            class="rail-item"
            class:active={item.id === selectedId}
            onclick={() => {
              selectedId = item.id
              tab = 'effects'
            }}
          >
            <span class="dot" data-status={item.status}></span>
            {item.name}
          </button>
        {/each}
      </div>
    {/each}
  </aside>

  <main class="detail">
    {#if !selected}
      <p class="empty">No templates discovered.</p>
    {:else if selected.error}
      <Card>
        <h2>{selected.id}</h2>
        <p class="error-message">{selected.error.message}</p>
        <p class="path">{selected.error.path}</p>
      </Card>
    {:else}
      {@const t = selected.template!}
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
      </div>

      {#if tab === 'effects'}
        <div class="variables">
          {#each t.variables as v (v.name)}
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
                      {#each [...new Set(kinds)] as kind (kind)}
                        <Badge tone="neutral">{kind}</Badge>
                      {/each}
                    </li>
                  {/each}
                </ul>
              {/if}
            </Card>
          {/each}
        </div>
      {:else if tab === 'schema'}
        <div class="schema-table">
          <table>
            <thead>
              <tr>
                <th>name</th>
                <th>default</th>
                <th>choices</th>
              </tr>
            </thead>
            <tbody>
              {#each t.variables as v (v.name)}
                <tr>
                  <td>{v.name}</td>
                  <td>{v.default}</td>
                  <td>{v.choices ? v.choices.join(', ') : '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else if tab === 'consistency'}
        <div class="lint-list">
          {#if selectedLint.length === 0}
            <p class="note muted">No lint findings.</p>
          {:else}
            {#each selectedLint as l, i (i)}
              <div class="lint-entry">
                <Badge tone={l.level === 'error' ? 'neg' : l.level === 'warn' ? 'warn' : 'info'}>
                  {l.level}
                </Badge>
                <span class="lint-code">{l.code}</span>
                <span class="lint-message">{l.message}</span>
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {/if}
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

  .rail {
    border-right: var(--hairline) solid var(--color-border);
    overflow-y: auto;
    padding: var(--space-4);
  }

  .rail-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .rail-header h1 {
    font-size: 14px;
    font-weight: 600;
  }
  .count {
    color: var(--color-muted);
    font-size: 12px;
  }

  .family {
    margin-bottom: var(--space-3);
  }
  .family-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-muted-2);
    padding: var(--space-1) var(--space-2);
  }

  .rail-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    text-align: left;
    padding: 6px var(--space-2);
    border-radius: var(--radius-sm);
    background: transparent;
    border: none;
    color: var(--color-fg-2);
    font-size: 13px;
    cursor: pointer;
  }
  .rail-item:hover {
    background: var(--color-hover);
  }
  .rail-item.active {
    background: var(--color-accent-soft);
    color: var(--color-accent-soft-fg);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    flex: none;
  }
  .dot[data-status='error'] {
    background: var(--color-neg);
  }
  .dot[data-status='warn'] {
    background: var(--color-warn);
  }
  .dot[data-status='clean'] {
    background: var(--color-pos);
  }

  .detail {
    padding: var(--space-6);
    overflow-y: auto;
  }

  .detail-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-1);
  }
  .detail-header h2 {
    font-size: 18px;
    font-weight: 600;
  }

  .path {
    color: var(--color-muted);
    font-size: 12px;
    font-family: monospace;
  }
  .description {
    color: var(--color-muted);
    margin-bottom: var(--space-4);
  }
  .error-message {
    color: var(--color-neg);
  }

  .tabs {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .badge-count {
    margin-left: var(--space-1);
    font-size: 10px;
    opacity: 0.8;
  }

  .variables {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .var-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .var-name {
    font-family: monospace;
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
    gap: var(--space-2);
    font-size: 12px;
  }
  .ref-file {
    font-family: monospace;
    color: var(--color-fg-2);
  }

  .schema-table table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .schema-table th {
    text-align: left;
    color: var(--color-muted);
    font-weight: 500;
    padding: var(--space-2);
    border-bottom: var(--hairline) solid var(--color-border);
  }
  .schema-table td {
    padding: var(--space-2);
    border-bottom: var(--hairline) solid var(--color-border-soft);
    font-family: monospace;
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
    font-family: monospace;
    color: var(--color-muted);
  }

  .empty {
    color: var(--color-muted);
  }
</style>
