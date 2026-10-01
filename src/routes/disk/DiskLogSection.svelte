<script lang="ts">
import Notice from '$lib/components/feedback/Notice.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import Table from '$lib/components/table/Table.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { Operation, Pending } from '$lib/disk-types'
import { errorMessage, tildify } from '$lib/format'
import type { Column } from '$lib/table'
import { human, job, readDisk, runJob } from './disk-client.svelte'

let { pending }: { pending: Pending[] } = $props()

let ops = $state<Operation[]>([])
let error = $state('')
let loaded = $state(false)
let note = $state('')
let skipPath = $state('')
let skipReason = $state('')

const runs = $derived.by(() => {
  const by = new Map<string, Operation[]>()
  for (const o of [...ops].reverse()) by.set(o.start.run, [...(by.get(o.start.run) ?? []), o])
  return [...by.entries()]
})

$effect(() => {
  job.finished
  readDisk('log', '--limit', '300')
    .then((r) => {
      ops = (r.data as Operation[]) ?? []
      error = ''
      loaded = true
    })
    .catch((e) => (error = errorMessage(e)))
})

const failed = (o: Operation) => !o.end || o.end.outcome === 'failed'
/** Chronological within a run, so no sort. On a phone the item cell carries the result too. */
const columns: Column<Operation>[] = [
  { key: 'at', width: '6.5rem', label: 'Time', hideBelow: 768, cell: timeCell },
  { key: 'op', width: '7rem', label: 'Operation', cell: opCell },
  { key: 'item', label: 'Item', wrap: true, cell: itemCell },
  { key: 'bytes', width: '5.5rem', label: 'Size', align: 'right', hideBelow: 768, cell: sizeCell },
  { key: 'result', label: 'Result', wrap: true, hideBelow: 768, cell: resultCell },
]
</script>

{#snippet timeCell(o: Operation)}<span class="num muted">{o.start.at.slice(11, 19)}</span>{/snippet}
{#snippet opCell(o: Operation)}<span class="mono">{o.start.op}</span>{/snippet}
{#snippet itemCell(o: Operation)}
  <span class="mono">{tildify(o.start.item)}{o.start.target ? ` → ${tildify(o.start.target)}` : ''}</span>
  <div class="phone-only">{@render resultCell(o)}</div>
{/snippet}
{#snippet sizeCell(o: Operation)}<span class="num">{o.start.bytes ? human(o.start.bytes) : ''}</span>{/snippet}
{#snippet resultCell(o: Operation)}
  {#if failed(o)}<Badge tone="neg">{o.end?.outcome ?? 'interrupted'}</Badge>{:else}{o.end?.outcome}{/if}
  {#if o.end?.message}<span>{o.end.message}</span>{/if}
{/snippet}

<section>
  {#if pending.length}
    <Notice tone="error">
      <strong>{pending.length} interrupted operation(s).</strong> Only Finish or Undo below may touch
      them.
    </Notice>
    <Card>
      {#each pending as p (p.start.id)}
        <div class="pending t-small">
          <div><span class="mono">{p.start.op} {p.start.item}</span>{p.start.target ? ` → ${p.start.target}` : ''}</div>
          <div class="muted">interrupted at '{p.steps.at(-1)?.phase ?? 'start'}' · {p.start.at.slice(0, 19).replace('T', ' ')} · {p.start.actor}</div>
          <div class="bar">
            <Button variant="primary" onclick={() => runJob('recover', ['finish', p.start.id])}>Finish</Button>
            <span class="muted">{p.finish}</span>
          </div>
          <div class="bar">
            <Button onclick={() => runJob('recover', ['undo', p.start.id])}>Undo</Button>
            <span class="muted">{p.undo}</span>
          </div>
        </div>
      {/each}
    </Card>
  {/if}

  <div class="bar">
    <h2 class="t-h3">Operation log</h2>
    <span class="t-caption muted">newest run first · <span class="mono">operations.jsonl</span></span>
  </div>
  <div class="bar t-small">
    <input class="grow" placeholder="Add a note…" bind:value={note} />
    <Button disabled={!note.trim()} onclick={() => (runJob('log', ['note', '--', note.trim()]), (note = ''))}>Note</Button>
    <input class="mono grow" placeholder="/path/you/chose/to/keep" bind:value={skipPath} />
    <input class="grow" placeholder="why" bind:value={skipReason} />
    <Button disabled={!skipPath.startsWith('/') || !skipReason.trim()} onclick={() => (runJob('log', ['skip', skipPath.trim(), '--reason', skipReason.trim()]), (skipPath = ''), (skipReason = ''))}>Record skip</Button>
  </div>
  <PageState
    loading={!loaded && !error}
    {error}
    empty={!runs.length}
    emptyText="The operation log is empty."
  >
    {#each runs as [run, list] (run)}
      <Card flush>
        <div class="run t-caption muted mono">{run} · {list[0].start.actor} · {list.length} operation(s)</div>
        <Table label="Run {run}" rows={list} key={(o) => o.start.id} {columns} />
      </Card>
    {/each}
  </PageState>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  section .bar {
    margin-bottom: 0;
  }

  .pending {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-bottom: var(--space-3);
  }

  .grow {
    flex: 1;
    min-width: 140px;
  }

  .phone-only {
    display: none;
  }

  @media (max-width: 768px) {
    .phone-only {
      display: block;
    }
  }

  .run {
    padding: var(--space-2) var(--space-3);
  }
</style>
