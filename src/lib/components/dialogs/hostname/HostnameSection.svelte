<script lang="ts">
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte'
import Button from '$lib/components/ui/Button.svelte'
import { errorMessage } from '$lib/format'
import type { HostnameState, SlugCheck } from '$lib/hostnames/types'
import { http } from '$lib/http'
import type { Project } from '$lib/scanner'
import { toast } from '$lib/toast.svelte'
import { hostOf, setChip } from './hostname.svelte'
import PortField from './PortField.svelte'
import SlugField from './SlugField.svelte'
import StatusPill from './StatusPill.svelte'

interface Props {
  project: Project
  slug: string
  port: number | null
  devPublic: boolean
  verdict: SlugCheck | null
  /** The project's route as the server knows it; null = none. */
  hostname: HostnameState | null
}

let {
  project,
  slug = $bindable(),
  port = $bindable(),
  devPublic = $bindable(),
  verdict = $bindable(),
  hostname = $bindable(),
}: Props = $props()

let releasing = $state(false)
let busy = $state(false)

const POLL_MS = 1000

/** Take a state from the server and show it on the row's chip too. */
function show(next: HostnameState | null): void {
  hostname = next && next.state !== 'none' ? next : null
  setChip(project.path, hostname)
}

// syncing / issuing settle server-side (the tracker probes the name over TLS); follow them here.
$effect(() => {
  const h = hostname
  if (!h || (h.state !== 'syncing' && h.state !== 'issuing')) return
  const timer = setTimeout(() => {
    http
      .get<HostnameState>(`/api/hostnames/status?slug=${encodeURIComponent(h.slug)}`)
      .then((next) => {
        if (hostname?.slug === next.slug) show(next)
      })
      .catch(() => {})
  }, POLL_MS)
  return () => clearTimeout(timer)
})

async function run(what: string, call: () => Promise<HostnameState>): Promise<void> {
  busy = true
  if (hostname) hostname = { ...hostname, state: 'syncing', error: undefined }
  try {
    show(await call())
  } catch (e) {
    toast(`${what} failed: ${errorMessage(e)}`, 'error')
    if (hostname) hostname = { ...hostname, state: 'failed', error: errorMessage(e) }
  } finally {
    busy = false
  }
}

const assign = () =>
  run('Assign', () => http.post<HostnameState>('/api/hostnames', { path: project.path }))

const retry = () =>
  run('Retry', () => http.post<HostnameState>('/api/hostnames/retry', { slug: hostname?.slug }))

async function copy(url: string): Promise<void> {
  await navigator.clipboard.writeText(url)
  toast(`Copied ${hostOf(url)}`)
}

async function release(): Promise<void> {
  await http.delete('/api/hostnames', { path: project.path })
  show(null)
  toast('Hostname released')
}
</script>

<section class="hostname" aria-label="Dev hostname">
  <div class="head">
    <span class="t-caption">Dev hostname</span>
    <StatusPill status={hostname?.state ?? 'none'} error={hostname?.error} onretry={retry} />
    <span class="actions">
      {#if hostname}
        <Button onclick={() => hostname && copy(hostname.local)}>Copy</Button>
        <Button onclick={() => hostname && window.open(hostname.local, '_blank', 'noreferrer')}>
          Open
        </Button>
        <Button variant="danger" disabled={busy} onclick={() => (releasing = true)}>Release</Button>
      {:else}
        <Button disabled={busy} onclick={assign}>Assign hostname</Button>
      {/if}
    </span>
  </div>

  {#if hostname}
    <a class="current mono t-small" href={hostname.local} target="_blank" rel="noreferrer">
      {hostOf(hostname.local)}
    </a>
  {/if}

  <div class="grid">
    <div class="col">
      <SlugField path={project.path} bind:value={slug} {devPublic} bind:verdict />
    </div>
    <div class="col">
      <PortField bind:value={port} />
    </div>
  </div>

  <label class="toggle">
    <input type="checkbox" bind:checked={devPublic} />
    <span>
      Let anyone with the link open <span class="mono">atlas.remote</span> — no password
    </span>
  </label>
</section>

<ConfirmDialog
  open={releasing}
  title="Release {hostname ? hostOf(hostname.local) : 'this hostname'}?"
  message="The NAS stops serving it; the dev server and its port stay as they are."
  confirmLabel="Release"
  danger
  onconfirm={release}
  onclose={() => (releasing = false)}
/>

<style>
  .hostname {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-left: auto;
  }

  .current {
    color: var(--color-accent);
    overflow-wrap: anywhere;
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 12px;
    color: var(--color-fg-2);
  }

  @media (max-width: 560px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
