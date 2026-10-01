<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import { errorMessage, tildify } from '$lib/format'
import { http } from '$lib/http'
import { bytes, duration } from '$lib/processes/display'
import type { AppRow, ProcessInfo } from '$lib/processes/types'
import { toast } from '$lib/toast.svelte'

/** An opened row: what it is made of, and everything that can be done to it. */
interface Props {
  row: AppRow
  members: ProcessInfo[]
  restartable: boolean
  onstop: (opts: { tree?: boolean; force?: boolean }) => void
  onrestart: () => void
}

const { row, members, restartable, onstop, onrestart }: Props = $props()

const main = $derived(members.find((p) => p.pid === row.primary))
const ORPHAN = { 'parent-exited': 'its parent exited', 'folder-gone': 'its folder is gone' }

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`Copied ${what}`)
  } catch (e) {
    toast(`Copy failed: ${errorMessage(e)}`, 'error')
  }
}

async function reveal(path: string) {
  try {
    await http.post('/api/finder', { path })
  } catch (e) {
    toast(`Reveal failed: ${errorMessage(e)}`, 'error')
  }
}
</script>

<div class="detail">
  <div class="actions">
    {#if row.launchd}
      <span class="t-small muted">
        launchd job <code class="mono">{row.launchd}</code>:
        <a href="/system?tab=daemons">restart it from System › Daemons</a>
      </span>
    {:else}
      <Button variant="danger" onclick={() => onstop({})}>Stop</Button>
      <Button variant="danger" onclick={() => onstop({ tree: true })}>Stop tree</Button>
      <Button variant="danger" onclick={() => onstop({ tree: true, force: true })}>Force stop</Button>
    {/if}
    {#if restartable}<Button onclick={onrestart}>Restart</Button>{/if}
    {#if row.atlasRun?.slug}
      <a class="link" href="/api/processes/log?slug={encodeURIComponent(row.atlasRun.slug)}" target="_blank" rel="noreferrer">Open log</a>
    {/if}
    {#if row.atlasRun?.hostname}
      <a class="link" href={row.atlasRun.hostname} target="_blank" rel="noreferrer">Open hostname</a>
    {/if}
    {#if row.project && main?.cwd}
      <Button onclick={() => reveal(main.cwd ?? '')}>Reveal folder</Button>
    {/if}
    <Button onclick={() => copy(String(row.primary), `pid ${row.primary}`)}>Copy pid</Button>
    {#if main?.command}
      <Button onclick={() => copy(main.command, 'the command')}>Copy command</Button>
    {/if}
  </div>

  <p class="t-small facts">
    {#if row.session}<span>session <strong>{row.session}</strong></span>{/if}
    {#if row.orphanReason}<span class="warn">orphan: {ORPHAN[row.orphanReason]}</span>{/if}
    {#if row.duplicateOf?.length}
      <span class="warn">serves the same checkout as {row.duplicateOf.length} other row{row.duplicateOf.length === 1 ? '' : 's'}</span>
    {/if}
    {#if main?.via}<span class="muted">project by {main.via}</span>{/if}
  </p>

  <ul class="members">
    {#each members as p (p.pid)}
      <li class:primary={p.pid === row.primary}>
        <span class="mono num muted">{p.pid}</span>
        <span class="name">{p.name}<span class="muted"> · {p.kind}</span></span>
        <span class="num">{p.cpu.toFixed(1)}%</span>
        <span class="num">{bytes(p.rss)}</span>
        <span class="num muted">{duration(p.uptime)}</span>
        <code class="mono cmd">{p.zombie ? '(exited, not yet reaped)' : p.command || `(${p.exe}, arguments unreadable)`}</code>
        {#if p.cwd}<span class="mono muted cwd">{tildify(p.cwd)}</span>{/if}
      </li>
    {/each}
  </ul>
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--row-px);
  }

  .actions,
  .facts {
    display: flex;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    flex-wrap: wrap;
  }

  .link,
  .actions a {
    color: var(--color-accent);
    font-size: 13px;
    text-decoration: none;
  }

  .link:hover {
    text-decoration: underline;
  }

  .warn {
    color: var(--color-warn);
  }

  .members {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    list-style: none;
  }

  .members li {
    display: grid;
    grid-template-columns: 4.5rem minmax(8rem, 14rem) 4rem 5rem 4.5rem 1fr;
    gap: var(--space-1) var(--space-3);
    align-items: baseline;
    font-size: 12px;
  }

  .members li.primary .name {
    font-weight: 600;
  }

  .cmd {
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .cwd {
    grid-column: 2 / -1;
  }

  @media (width < 768px) {
    .members li {
      grid-template-columns: 4rem 1fr 4rem 4.5rem;
    }

    .members li > :nth-child(5) {
      display: none;
    }

    .cmd {
      grid-column: 1 / -1;
    }
  }
</style>
