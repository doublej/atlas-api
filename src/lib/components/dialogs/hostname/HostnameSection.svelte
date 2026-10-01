<script lang="ts">
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte'
import Notice from '$lib/components/feedback/Notice.svelte'
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

// The preview follows every keystroke; the verdict catches up after the debounce.
const shown = $derived(slug.trim() || verdict?.slug || '')

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
    status(h.slug)
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
  try {
    await navigator.clipboard.writeText(url)
    toast(`Copied ${hostOf(url)}`)
  } catch (e) {
    toast(`Copy failed: ${errorMessage(e)}`, 'error') // a page without focus may not write
  }
}

const status = (slug: string) =>
  http.get<HostnameState>(`/api/hostnames/status?slug=${encodeURIComponent(slug)}`)

async function release(): Promise<void> {
  try {
    await http.delete('/api/hostnames', { path: project.path })
  } catch (e) {
    // A failed NAS removal keeps the route as unsynced: the pill shows it, with Retry.
    if (hostname) show(await status(hostname.slug).catch(() => hostname))
    throw e
  }
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

  {#if hostname?.state === 'failed' && hostname.error}
    <Notice tone="error">{hostname.error}</Notice>
  {/if}

  {#if hostname}
    <a class="current mono t-small" href={hostname.local} target="_blank" rel="noreferrer">
      {hostOf(hostname.local)}
    </a>
  {/if}

  <div class="grid">
    <div class="col">
      <SlugField path={project.path} bind:value={slug} bind:verdict current={hostname?.slug} />
    </div>
    <div class="col">
      <PortField bind:value={port} />
    </div>
  </div>

  {#if shown && verdict?.status !== 'invalid'}
    <ul class="preview t-caption" aria-label="URLs this slug gets">
      <li><span class="mono">{shown}.atlas.local.jurrejan.com</span> <span class="muted-2">LAN</span></li>
      <li>
        {#if verdict?.remote === null}
          <span class="muted-2">no atlas.remote — the daemon has no password hash to gate it</span>
        {:else}
          <span class="mono">{shown}.atlas.remote.jurrejan.com</span>
          <span class="muted-2">off-LAN, {devPublic ? 'no password' : 'password'}</span>
        {/if}
      </li>
    </ul>
  {/if}

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

  .preview {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-wrap: anywhere;
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
