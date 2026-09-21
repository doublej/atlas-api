<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { Operation, Pending } from '$lib/disk-types'
import { human, job, readDisk, runJob, tildify } from './disk-client.svelte'

let { pending }: { pending: Pending[] } = $props()

let ops = $state<Operation[]>([])
let error = $state('')
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
    })
    .catch((e: Error) => (error = e.message))
})

const result = (o: Operation) =>
  o.end ? `${o.end.outcome}${o.end.message ? `: ${o.end.message}` : ''}` : 'INTERRUPTED'
</script>

<section>
  {#if pending.length}
    <div class="bar"><h2 class="t-h3 err">Interrupted operations</h2></div>
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
  {#if error}<p class="t-small err">{error}</p>{/if}

  {#each runs as [run, list] (run)}
    <Card flush>
      <div class="run t-caption muted mono">{run} · {list[0].start.actor} · {list.length} operation(s)</div>
      <div class="scroll">
        <table>
          <tbody>
            {#each list as o (o.start.id)}
              <tr class="t-small">
                <td class="num muted">{o.start.at.slice(11, 19)}</td>
                <td class="mono">{o.start.op}</td>
                <td class="mono wrap">{tildify(o.start.item)}{o.start.target ? ` → ${tildify(o.start.target)}` : ''}</td>
                <td class="num right">{o.start.bytes ? human(o.start.bytes) : ''}</td>
                <td class="wrap result" class:err={!o.end || o.end.outcome === 'failed'}>{result(o)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  {:else}
    <p class="t-small muted">The operation log is empty.</p>
  {/each}
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

  .result {
    min-width: 14em;
  }

  .run {
    padding: var(--space-2) var(--space-3);
  }
</style>
