<script lang="ts">
import PageState from '$lib/components/feedback/PageState.svelte'
import Table from '$lib/components/table/Table.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import { errorMessage } from '$lib/format'
import type { DriftItem } from '$lib/hostnames/types'
import { http } from '$lib/http'
import type { Column } from '$lib/table'
import { toast } from '$lib/toast.svelte'

interface Report {
  checkedAt: string
  items: DriftItem[]
}
interface FixReport {
  results: { id: string; ok: boolean; error?: string }[]
  items: DriftItem[]
}

let report = $state<Report | null>(null)
let error = $state<string | null>(null)
/** The id being fixed, or `*` for "fix all" — one at a time, each one reloads Caddy. */
let fixing = $state<string | null>(null)

const fixable = $derived(report?.items.filter((i) => i.fix) ?? [])
const columns: Column<DriftItem>[] = [
  { key: 'kind', label: 'Drift', sort: (i) => i.kind, cell: kindCell },
  { key: 'slug', label: 'Slug', sort: (i) => i.slug, cell: slugCell, hideBelow: 768 },
  { key: 'detail', label: 'Detail', wrap: true, cell: detailCell },
  { key: 'fix', label: 'Fix', hideLabel: true, cell: fixCell },
]

async function load(): Promise<void> {
  try {
    report = await http.get<Report>('/api/hostnames/doctor')
    error = null
  } catch (e) {
    error = errorMessage(e)
  }
}

async function fix(ids?: string[]): Promise<void> {
  fixing = ids?.[0] ?? '*'
  try {
    const out = await http.post<FixReport>('/api/hostnames/doctor', ids ? { ids } : {})
    report = { checkedAt: new Date().toISOString(), items: out.items }
    const failed = out.results.filter((r) => !r.ok)
    if (failed.length) toast(`Fix failed: ${failed.map((r) => r.error).join('; ')}`, 'error')
    else toast(`Fixed ${out.results.length} item${out.results.length === 1 ? '' : 's'}`)
  } catch (e) {
    toast(`Fix failed: ${errorMessage(e)}`, 'error')
  } finally {
    fixing = null
  }
}

$effect(() => {
  load()
})
</script>

{#snippet kindCell(i: DriftItem)}
  <Badge tone={i.fix ? 'warn' : 'neutral'}>{i.kind}</Badge>
{/snippet}

{#snippet slugCell(i: DriftItem)}
  <code class="mono">{i.slug ?? '—'}</code>
{/snippet}

{#snippet detailCell(i: DriftItem)}
  <span class="t-small">{i.detail}</span>
{/snippet}

{#snippet fixCell(i: DriftItem)}
  {#if i.fix}
    <Button disabled={fixing !== null} onclick={() => fix([i.id])}>
      {fixing === i.id ? 'Fixing…' : i.fix.label}
    </Button>
  {:else}
    <span class="t-caption muted-2">needs JJ</span>
  {/if}
{/snippet}

{#snippet none()}
  <Badge tone="pos" dot="currentColor">clear</Badge> Registry, projects, services and the NAS agree.
{/snippet}

<section>
  <header>
    <h2 class="t-h3">Hostnames</h2>
    <span class="t-small muted">
      registry · projects · services · NAS Caddy{report
        ? ` — checked ${new Date(report.checkedAt).toLocaleTimeString()}`
        : ''}
    </span>
    <span class="tools">
      <Button disabled={fixing !== null} onclick={load}>Check again</Button>
      {#if fixable.length > 1}
        <Button variant="primary" disabled={fixing !== null} onclick={() => fix()}>
          {fixing === '*' ? 'Fixing…' : `Fix all ${fixable.length}`}
        </Button>
      {/if}
    </span>
  </header>

  <PageState loading={!report && !error} loadingText="Asking the NAS…" {error} onretry={load}>
    {#if report}
      <Card flush>
        <Table label="Hostname drift" rows={report.items} key={(i) => i.id} {columns} empty={none} />
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

  .tools {
    display: inline-flex;
    gap: var(--space-2);
    margin-left: auto;
  }
</style>
