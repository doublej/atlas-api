<script lang="ts">
import Table from '$lib/components/table/Table.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { Column } from '$lib/table'
import type { TemplateVariable } from '$lib/templates'

let { variables }: { variables: TemplateVariable[] } = $props()

const columns: Column<TemplateVariable>[] = [
  { key: 'name', width: '14rem', label: 'name', sort: (v) => v.name, cell: nameCell },
  {
    key: 'default',
    label: 'default',
    sort: (v) => String(v.default),
    cell: defaultCell,
    wrap: true,
  },
  {
    key: 'choices',
    label: 'choices',
    sort: (v) => v.choices?.join(', '),
    cell: choicesCell,
    wrap: true,
  },
]
</script>

{#snippet nameCell(v: TemplateVariable)}<span class="mono">{v.name}</span>{/snippet}
{#snippet defaultCell(v: TemplateVariable)}<span class="mono">{v.default}</span>{/snippet}
{#snippet choicesCell(v: TemplateVariable)}
  <span class="mono">{v.choices ? v.choices.join(', ') : '—'}</span>
{/snippet}

<Card flush>
  <Table label="Template variables" rows={variables} key={(v) => v.name} {columns} />
</Card>
