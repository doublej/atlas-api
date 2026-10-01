<script lang="ts">
import Notice from '$lib/components/feedback/Notice.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import { errorMessage } from '$lib/format'
import type { HostnameRow, HostnameState, SlugCheck } from '$lib/hostnames/types'
import { http } from '$lib/http'
import type { Project } from '$lib/scanner'
import { toast } from '$lib/toast.svelte'
import HostnameSection from './hostname/HostnameSection.svelte'
import { hostOf, portProblem, setChip } from './hostname/hostname.svelte'
import ScanOverrides from './ScanOverrides.svelte'

interface Props {
  /** `null` closes the dialog — the same convention RenameDialog and MoveDialog use. */
  project: Project | null
  onclose: () => void
  /** Called after a successful save so the page can rescan and pick the change up. */
  onsaved: () => void
}

const { project, onclose, onsaved }: Props = $props()

type Meta = Record<string, unknown>

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
let form = $state({
  description: '',
  type: '',
  framework: '',
  slug: '',
  port: null as number | null,
  archived: false,
  devPublic: false,
})
let hostname = $state<HostnameState | null>(null)
let verdict = $state<SlugCheck | null>(null)
let status = $state<string | null>(null)
let saving = $state(false)
let overrides = $state<ScanOverrides>()

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
  hostname = null
  Promise.all([
    http.get<{ meta?: Meta }>(`/api/atlas?path=${encodeURIComponent(target.path)}`),
    http.get<HostnameRow[]>('/api/hostnames?all=1'),
  ])
    .then(([atlas, rows]) => {
      meta = atlas.meta ?? {}
      hostname = rows.find((r) => r.path === target.path) ?? null
      form = {
        description: str(meta.description),
        type: str(meta.type),
        framework: str(meta.framework),
        slug: str(meta.slug),
        port: typeof meta.port === 'number' ? meta.port : null,
        archived: meta.archived === true,
        devPublic: meta.devPublic === true,
      }
    })
    .catch((err) => (status = errorMessage(err)))
})

/** Empty clears the override — `null` is what `PATCH /api/atlas` reads as "delete this key". */
const value = (v: string): string | null => (v.trim() === '' ? null : v.trim())

/** Why the form can't be saved yet, or null. The server checks all of it again. */
function blocker(): string | null {
  if (verdict?.status === 'invalid' || verdict?.status === 'taken') return verdict.reason ?? null
  const port = portProblem(form.port)
  return port ? `Dev port: ${port}` : null
}

/** Does `patch` change what the route serves — its slug, port or devPublic? */
const movesRoute = (patch: Meta): boolean =>
  (['slug', 'port', 'devPublic'] as const).some((k) => patch[k] !== (meta[k] ?? null))

function saved(target: Project, res: { atlas: Meta; hostname?: HostnameState }): void {
  meta = res.atlas
  onsaved()
  if (!res.hostname) {
    toast('Saved')
    onclose()
    return
  }
  // The route moved: stay open so the pill can follow it to live.
  hostname = res.hostname
  setChip(target.path, res.hostname)
  toast(`Saved — hostname is now ${hostOf(res.hostname.local)}`)
}

async function save(): Promise<void> {
  const target = project
  if (!target || saving) return
  status = blocker()
  if (status) return
  saving = true

  const patch: Meta = {
    description: value(form.description),
    type: value(form.type),
    framework: value(form.framework),
    slug: value(form.slug),
    port: form.port,
    archived: form.archived || null,
    devPublic: form.devPublic || null,
  }
  // The pill says the NAS is being asked; its poll settles it whichever way the call goes.
  if (hostname && movesRoute(patch)) hostname = { ...hostname, state: 'syncing', error: undefined }

  try {
    const res = await http.patch<{ atlas: Meta; hostname?: HostnameState }>('/api/atlas', {
      path: target.path,
      patch,
    })
    await overrides?.save()
    saved(target, res)
  } catch (e) {
    status = errorMessage(e)
  } finally {
    saving = false
  }
}
</script>

<Modal open={project !== null} title="Project settings" {onclose}>
  {#if project}
    <div class="settings">
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

        <label class="field toggle">
          <input type="checkbox" bind:checked={form.archived} />
          <span>Archived</span>
        </label>
      </div>

      <hr />

      <HostnameSection
        {project}
        bind:slug={form.slug}
        bind:port={form.port}
        bind:devPublic={form.devPublic}
        bind:verdict
        bind:hostname
      />

      <hr />

      <ScanOverrides {project} bind:this={overrides} />

      {#if rest.length > 0}
        <details>
          <summary class="t-caption muted">Other .atlas keys ({rest.length}) — left untouched</summary>
          <pre class="mono">{JSON.stringify(Object.fromEntries(rest), null, 2)}</pre>
        </details>
      {/if}

      {#if status}
        <div class="status"><Notice tone="error">{status}</Notice></div>
      {/if}
    </div>
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

  .settings :global(input:not([type='checkbox'])),
  .settings :global(select) {
    height: 30px;
    padding: 0 var(--space-2);
    font-family: inherit;
    font-size: 12px;
    color: var(--color-fg);
    background: var(--color-card-2);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .settings :global(input:focus-visible),
  .settings :global(select:focus-visible) {
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

  .settings :global(input[aria-invalid='true']) {
    border-color: var(--color-neg);
  }

  .status {
    margin-top: var(--space-3);
  }

  @media (max-width: 560px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
