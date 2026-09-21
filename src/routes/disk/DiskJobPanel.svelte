<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import { cancelJob, EXIT_NAMES, job, poll } from './disk-client.svelte'

const POLL_MS = 500
const MARKS: Record<string, string> = {
  '✓': 'done',
  '–': 'skipped',
  '⊘': 'refused',
  '✗': 'failed',
  '⚠': 'refused',
}

const id = $derived(job.current?.id)
const lines = $derived(job.text.split('\n'))
let pre = $state<HTMLPreElement>()

// One poll loop per job id (a derived id, so a poll updating `job.current` doesn't restart it).
$effect(() => {
  if (!id) return
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  const tick = async () => {
    const more = await poll().catch(() => true)
    if (more && !stopped) timer = setTimeout(tick, POLL_MS)
  }
  timer = setTimeout(tick, 0)
  return () => {
    stopped = true
    clearTimeout(timer)
  }
})

$effect(() => {
  job.text
  if (pre) pre.scrollTop = pre.scrollHeight
})

const exitName = (code: number | null) =>
  code === null ? 'ended without an exit record' : (EXIT_NAMES[code] ?? `exit ${code}`)
</script>

{#if job.current || job.error}
  <section class="panel" aria-live="polite">
    <header class="t-small">
      {#if job.current}
        <span class="mono cmd">atlas disk {job.current.args.join(' ')}</span>
        {#if job.current.done}
          <span class="state" data-exit={job.current.exit}>{exitName(job.current.exit)}</span>
        {:else}
          <span class="state running">running…</span>
        {/if}
      {/if}
      {#if job.error}<span class="err">{job.error}</span>{/if}
      <span class="spacer"></span>
      {#if job.current && !job.current.done}
        <Button variant="danger" onclick={cancelJob}>Cancel</Button>
      {:else}
        <Button onclick={() => ((job.current = null), (job.error = ''))}>Close</Button>
      {/if}
    </header>
    {#if job.current}
      <pre bind:this={pre} class="mono">{#each lines as line, i (i)}<span class={MARKS[line.trim()[0]] ?? ''}>{line}</span>{'\n'}{/each}</pre>
    {/if}
  </section>
{/if}

<style>
  .panel {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 50;
    max-width: var(--col-max);
    margin: 0 auto;
    background: var(--color-bg-elev);
    border-top: var(--hairline) solid var(--color-border-strong);
    box-shadow: var(--shadow-lg);
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--page-pad);
    flex-wrap: wrap;
  }

  .cmd {
    overflow-wrap: anywhere;
  }

  .spacer {
    flex: 1;
  }

  .state {
    color: var(--color-neg);
  }

  .state[data-exit='0'],
  .state[data-exit='2'] {
    color: var(--color-pos);
  }

  .state.running {
    color: var(--color-info);
  }

  .err {
    color: var(--color-neg);
  }

  pre {
    max-height: 240px;
    margin: 0;
    padding: var(--space-2) var(--page-pad) var(--space-3);
    overflow: auto;
    font-size: 12px;
    white-space: pre-wrap;
  }

  .done {
    color: var(--color-pos);
  }

  .skipped {
    color: var(--color-muted);
  }

  .refused {
    color: var(--color-warn);
  }

  .failed {
    color: var(--color-neg);
  }
</style>
