<script lang="ts">
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { HostState } from '$lib/scanner'
import type { HostDef } from '$shared/hosts'

let { hosts, states }: { hosts: HostDef[]; states: HostState[] } = $props()

/** Editable mirror of a `HostDef`: `ssh` is a string here, empty meaning "primary" (`null`). */
interface HostForm {
  id: string
  label: string
  ssh: string
  root: string
  os: HostDef['os']
  role: HostDef['role']
  node: string
  agent: string
  skipGit: boolean
}

/** Only what this page changed lives in state; everything else stays the server's rendering. */
let saved = $state<HostDef[] | null>(null)
const registry = $derived(saved ?? hosts)
let rescanned = $state<HostState[] | null>(null)
const liveStates = $derived(rescanned ?? states)

let rescanning = $state<string | null>(null)
let rescanError = $state<Record<string, string>>({})

let editing = $state(false)
let forms = $state<HostForm[]>([])
let saving = $state(false)
let saveError = $state('')
let restartRequired = $state(false)

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const stateFor = (id: string): HostState | undefined => liveStates.find((s) => s.id === id)

function age(iso: string | undefined): string {
  if (!iso) return 'never'
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return `${Math.round(s)}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

async function rescan(id: string) {
  rescanning = id
  rescanError = { ...rescanError, [id]: '' }
  try {
    const res = await fetch(`/api/refresh?host=${encodeURIComponent(id)}&force=true`, {
      method: 'POST',
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    if (Array.isArray(body.hosts)) rescanned = body.hosts
  } catch (e) {
    rescanError = { ...rescanError, [id]: message(e) }
  } finally {
    rescanning = null
  }
}

function openEditor() {
  forms = registry.map((h) => ({
    id: h.id,
    label: h.label,
    ssh: h.ssh ?? '',
    root: h.root,
    os: h.os,
    role: h.role,
    node: h.node ?? '',
    agent: h.agent ?? '',
    skipGit: h.skipGit ?? false,
  }))
  saveError = ''
  editing = true
}

function fromForm(f: HostForm): HostDef {
  const host: HostDef = {
    id: f.id.trim(),
    label: f.label.trim(),
    ssh: f.ssh.trim() === '' ? null : f.ssh.trim(),
    root: f.root.trim(),
    os: f.os,
    role: f.role,
  }
  if (f.node.trim()) host.node = f.node.trim()
  if (f.agent.trim()) host.agent = f.agent.trim()
  if (f.skipGit) host.skipGit = true
  return host
}

async function saveRegistry() {
  saving = true
  saveError = ''
  try {
    const res = await fetch('/api/hosts', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hosts: forms.map(fromForm) }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
    saved = body.hosts
    restartRequired = true
    editing = false
  } catch (e) {
    saveError = message(e)
  } finally {
    saving = false
  }
}
</script>

<section>
  <header>
    <h2 class="t-h3">Hosts</h2>
    <span class="t-small muted">the machines atlas catalogs — only the primary is ever written to</span>
    <Button onclick={openEditor}>Edit registry</Button>
  </header>

  {#if restartRequired}
    <p class="banner warn t-small">
      <strong>Restart required.</strong> `shared/hosts.json` is on disk, but the running daemon still
      holds the copy it started with. Run <code class="mono">bun run daemon:reload</code> before the
      new registry takes effect.
    </p>
  {/if}

  <div class="grid">
    {#each registry as host (host.id)}
      {@const s = stateFor(host.id)}
      <Card>
        <div class="head">
          <span class="dot" data-status={s?.status ?? 'unknown'}></span>
          <span class="name">{host.label}</span>
          <code class="mono t-caption muted">{host.id}</code>
          <Badge tone={host.role === 'primary' ? 'accent' : 'neutral'}>{host.role}</Badge>
        </div>

        <dl>
          <dt class="t-caption muted-2">root</dt>
          <dd class="mono t-caption">{host.root}</dd>
          <dt class="t-caption muted-2">ssh</dt>
          <dd class="mono t-caption">{host.ssh ?? '— (in-process)'}</dd>
          <dt class="t-caption muted-2">os</dt>
          <dd class="mono t-caption">{host.os}{host.skipGit ? ' · git skipped' : ''}</dd>
          <dt class="t-caption muted-2">last scan</dt>
          <dd class="t-caption">{age(s?.scannedAt)}</dd>
          <dt class="t-caption muted-2">projects</dt>
          <dd class="t-caption num">{s?.projectCount ?? '—'}</dd>
        </dl>

        {#if s?.error}
          <p class="t-caption err">{s.error}</p>
        {/if}
        {#if rescanError[host.id]}
          <p class="t-caption err">{rescanError[host.id]}</p>
        {/if}

        <div class="foot">
          <Button onclick={() => rescan(host.id)} disabled={rescanning !== null}>
            {rescanning === host.id ? 'Rescanning…' : 'Rescan'}
          </Button>
          {#if rescanning === host.id}
            <span class="t-caption muted">SSH scan, ~9s</span>
          {/if}
        </div>
      </Card>
    {/each}
  </div>
</section>

<Modal open={editing} title="Host registry" onclose={() => (editing = false)}>
  <div class="editor">
    <p class="t-caption muted">
      Exactly one host must leave <code class="mono">ssh</code> empty — that is the primary, scanned
      in-process. Never store an IP: these are DHCP.
    </p>
    {#each forms as form, i (i)}
      <fieldset>
        <legend class="t-caption muted-2">{form.id || 'host'}</legend>
        <label class="t-caption">id<input bind:value={form.id} /></label>
        <label class="t-caption">label<input bind:value={form.label} /></label>
        <label class="t-caption">ssh<input bind:value={form.ssh} placeholder="empty = primary" /></label>
        <label class="t-caption">root<input bind:value={form.root} /></label>
        <label class="t-caption">
          os
          <select bind:value={form.os}>
            <option value="darwin">darwin</option>
            <option value="linux">linux</option>
            <option value="win32">win32</option>
          </select>
        </label>
        <label class="t-caption">
          role
          <select bind:value={form.role}>
            <option value="primary">primary</option>
            <option value="satellite">satellite</option>
            <option value="deploy">deploy</option>
          </select>
        </label>
        <label class="t-caption">node<input bind:value={form.node} placeholder="optional" /></label>
        <label class="t-caption">agent<input bind:value={form.agent} placeholder="optional" /></label>
        <label class="t-caption check">
          <input type="checkbox" bind:checked={form.skipGit} />skipGit
        </label>
      </fieldset>
    {/each}
    {#if saveError}
      <p class="t-caption err">{saveError}</p>
    {/if}
  </div>
  {#snippet footer()}
    <Button onclick={() => (editing = false)}>Cancel</Button>
    <Button variant="primary" onclick={saveRegistry} disabled={saving}>
      {saving ? 'Saving…' : 'Save registry'}
    </Button>
  {/snippet}
</Modal>

<style>
  header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }
  header span {
    flex: 1;
    min-width: 200px;
  }

  .banner {
    padding: var(--space-3);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--color-warn-soft);
    color: var(--color-warn);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-3);
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .name {
    font-weight: 600;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: var(--radius-full);
    flex: none;
    background: var(--color-muted-2);
  }
  .dot[data-status='ok'] {
    background: var(--color-pos);
  }
  .dot[data-status='unreachable'] {
    background: var(--color-warn);
  }
  .dot[data-status='error'] {
    background: var(--color-neg);
  }

  dl {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: var(--space-1) var(--space-2);
    margin: 0;
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .err {
    margin-top: var(--space-2);
    color: var(--color-neg);
    overflow-wrap: anywhere;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-height: 60vh;
    overflow-y: auto;
  }

  fieldset {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    padding: var(--space-3);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  legend {
    padding: 0 var(--space-1);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--color-muted);
  }
  label.check {
    flex-direction: row;
    align-items: center;
    gap: var(--space-1);
    grid-column: 1 / -1;
  }

  input,
  select {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 4px 6px;
    color: var(--color-fg);
    background: var(--color-card-2);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-xs);
  }
  input[type='checkbox'] {
    width: auto;
    padding: 0;
  }

  @media (max-width: 700px) {
    fieldset {
      grid-template-columns: 1fr;
    }
  }
</style>
