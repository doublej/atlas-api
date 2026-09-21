<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { Project } from '$lib/scanner'

interface Props {
  /** `null` closes the dialog — the same convention RenameDialog and MoveDialog use. */
  project: Project | null
  onclose: () => void
  /** Called after a successful save so the page can rescan and pick the change up. */
  onsaved: () => void
}

const { project, onclose, onsaved }: Props = $props()

type Meta = Record<string, unknown>
interface ScanConfig {
  maxDepth: number
  depth: Record<string, number>
  force: Record<string, boolean>
}

/** `.atlas` keys this form owns. Anything else is shown read-only and left untouched. */
const FIELDS = [
  'description',
  'type',
  'framework',
  'slug',
  'port',
  'archived',
  'devPublic',
] as const

let meta = $state<Meta>({})
let config = $state<ScanConfig | null>(null)
let form = $state({
  description: '',
  type: '',
  framework: '',
  slug: '',
  port: '',
  archived: false,
  devPublic: false,
  force: 'auto' as 'auto' | 'true' | 'false',
  depth: '',
})
let status = $state<string | null>(null)
let saving = $state(false)

const rest = $derived(
  Object.entries(meta).filter(([k]) => !(FIELDS as readonly string[]).includes(k)),
)

const str = (v: unknown): string => (v == null ? '' : String(v))

// Reloads whenever a different project opens the dialog. `.atlas` is read fresh rather than
// taken from the scan: the scan shows the *result* of the overrides, not the overrides.
$effect(() => {
  const target = project
  if (!target) return
  status = null
  Promise.all([
    fetch(`/api/atlas?path=${encodeURIComponent(target.path)}`).then((r) => r.json()),
    fetch('/api/config').then((r) => r.json()),
  ])
    .then(([atlas, scan]) => {
      meta = atlas.meta ?? {}
      config = scan
      form = {
        description: str(meta.description),
        type: str(meta.type),
        framework: str(meta.framework),
        slug: str(meta.slug),
        port: str(meta.port),
        archived: meta.archived === true,
        devPublic: meta.devPublic === true,
        force: str(scan.force?.[target.relativePath] ?? 'auto') as 'auto' | 'true' | 'false',
        depth: str(scan.depth?.[target.relativePath]),
      }
    })
    .catch((err) => (status = String(err)))
})

/** Empty clears the override — `null` is what `PATCH /api/atlas` reads as "delete this key". */
const value = (v: string): string | null => (v.trim() === '' ? null : v.trim())

async function save(): Promise<void> {
  if (!project || saving) return
  saving = true
  status = null

  const patch: Meta = {
    description: value(form.description),
    type: value(form.type),
    framework: value(form.framework),
    slug: value(form.slug),
    port: form.port.trim() === '' ? null : Number(form.port),
    archived: form.archived || null,
    devPublic: form.devPublic || null,
  }

  const res = await fetch('/api/atlas', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: project.path, patch }),
  })
  const body = await res.json()
  if (!res.ok) {
    status = body.error ?? 'save failed'
    saving = false
    return
  }

  const scanError = await saveScanConfig()
  saving = false
  if (scanError) {
    status = scanError
    return
  }
  onsaved()
  onclose()
}

/** The two knobs that live in `.atlas-config.json` rather than in the project's own `.atlas`. */
async function saveScanConfig(): Promise<string | null> {
  if (!project || !config) return null
  const rel = project.relativePath
  const next: ScanConfig = {
    maxDepth: config.maxDepth,
    depth: { ...config.depth },
    force: { ...config.force },
  }

  if (form.force === 'auto') delete next.force[rel]
  else next.force[rel] = form.force === 'true'

  if (form.depth.trim() === '') delete next.depth[rel]
  else next.depth[rel] = Number(form.depth)

  const unchanged =
    JSON.stringify(next.depth) === JSON.stringify(config.depth) &&
    JSON.stringify(next.force) === JSON.stringify(config.force)
  if (unchanged) return null

  const res = await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(next),
  })
  if (res.ok) return null
  return (await res.json()).error ?? 'scan config save failed'
}
</script>

<Modal open={project !== null} title="Project settings" {onclose}>
  {#if project}
    <p class="t-caption muted path">{project.relativePath}</p>

    <div class="grid">
      <label class="field wide">
        <span class="t-caption">Description</span>
        <input bind:value={form.description} placeholder="from README or package.json" />
      </label>

      <label class="field">
        <span class="t-caption">Type</span>
        <input bind:value={form.type} placeholder={project.type ?? 'detected'} />
      </label>

      <label class="field">
        <span class="t-caption">Framework</span>
        <input bind:value={form.framework} placeholder={project.framework ?? 'detected'} />
      </label>

      <label class="field">
        <span class="t-caption">Slug</span>
        <input bind:value={form.slug} placeholder={project.slug} />
      </label>

      <label class="field">
        <span class="t-caption">Dev port</span>
        <input bind:value={form.port} inputmode="numeric" placeholder="allocated on first run" />
      </label>

      <label class="field toggle">
        <input type="checkbox" bind:checked={form.archived} />
        <span>Archived</span>
      </label>

      <label class="field toggle">
        <input type="checkbox" bind:checked={form.devPublic} />
        <span>Dev hostname needs no password</span>
      </label>
    </div>

    <hr />

    <p class="t-caption muted">
      Scanner overrides for this path. <strong>Depth</strong> is the walk limit for this subtree —
      and the only way to catalog a project that sits inside this one.
      <strong>Detection</strong> promotes or demotes a folder the scanner read wrong.
    </p>

    <div class="grid">
      <label class="field">
        <span class="t-caption">Detection</span>
        <select bind:value={form.force}>
          <option value="auto">Automatic</option>
          <option value="true">Always a project</option>
          <option value="false">Never a project</option>
        </select>
      </label>

      <label class="field">
        <span class="t-caption">Scan depth</span>
        <input
          bind:value={form.depth}
          inputmode="numeric"
          placeholder={config ? `inherits ${config.maxDepth}` : 'inherits'}
        />
      </label>
    </div>

    {#if rest.length > 0}
      <details>
        <summary class="t-caption muted">Other .atlas keys ({rest.length}) — left untouched</summary>
        <pre class="mono">{JSON.stringify(Object.fromEntries(rest), null, 2)}</pre>
      </details>
    {/if}

    {#if status}
      <p class="t-small error">{status}</p>
    {/if}
  {/if}

  {#snippet footer()}
    <Button onclick={onclose}>Cancel</Button>
    <Button variant="primary" onclick={save} disabled={saving}>
      {saving ? 'Saving…' : 'Save'}
    </Button>
  {/snippet}
</Modal>

<style>
  .path {
    margin: 0 0 var(--space-3);
    font-family: var(--font-mono);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .field.wide {
    grid-column: 1 / -1;
  }

  .field.toggle {
    flex-direction: row;
    align-items: center;
    gap: var(--space-2);
    font-size: 12px;
    color: var(--color-fg-2);
  }

  input:not([type='checkbox']),
  select {
    height: 30px;
    padding: 0 var(--space-2);
    font-family: inherit;
    font-size: 12px;
    color: var(--color-fg);
    background: var(--color-card-2);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  input:focus-visible,
  select:focus-visible {
    outline: 2px solid var(--color-ring);
    outline-offset: 1px;
  }

  hr {
    height: var(--hairline);
    margin: var(--space-4) 0;
    background: var(--color-border);
    border: none;
  }

  pre {
    max-height: 140px;
    margin: var(--space-2) 0 0;
    padding: var(--space-2);
    overflow: auto;
    font-size: 11px;
    background: var(--color-card-2);
    border-radius: var(--radius-sm);
  }

  .error {
    margin: var(--space-3) 0 0;
    color: var(--color-neg);
  }

  @media (max-width: 560px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
