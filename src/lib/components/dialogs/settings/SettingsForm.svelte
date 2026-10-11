<script lang="ts">
import Notice from '$lib/components/feedback/Notice.svelte'
import { errorMessage } from '$lib/format'
import type { HostnameRow, HostnameState, SlugCheck } from '$lib/hostnames/types'
import { http } from '$lib/http'
import type { Project } from '$lib/scanner'
import { toast } from '$lib/toast.svelte'
import HostnameSection from '../hostname/HostnameSection.svelte'
import { hostOf, portProblem, setChip, slugBlocker } from '../hostname/hostname.svelte'
import ScanOverrides from '../ScanOverrides.svelte'
import { fieldsFromMeta, type Meta, OWNED_KEYS, patchFromFields } from './settings-form'

/**
 * The one project settings form: `.atlas` overrides, the dev hostname and the scanner overrides.
 * The modal (ProjectSettings) and the project page both render it and bring their own buttons,
 * which call `save()` / `reset()` and read `isDirty()` / `isSaving()`.
 */
interface Props {
  project: Project
  /** After a successful save, so the caller can rescan and pick the change up. */
  onsaved: () => void
}

const { project, onsaved }: Props = $props()

let meta = $state<Meta>({})
let form = $state(fieldsFromMeta({}))
let loaded = $state(fieldsFromMeta({}))
let hostname = $state<HostnameState | null>(null)
let verdict = $state<SlugCheck | null>(null)
let status = $state<string | null>(null)
let saving = $state(false)
let overrides = $state<ScanOverrides>()

const rest = $derived(Object.entries(meta).filter(([k]) => !OWNED_KEYS.includes(k)))

// `.atlas` is read fresh rather than taken from the scan: the scan shows the *result* of the
// overrides, not the overrides.
$effect(() => {
  const path = project.path
  status = null
  hostname = null
  Promise.all([
    http.get<{ meta?: Meta }>(`/api/atlas?path=${encodeURIComponent(path)}`),
    http.get<HostnameRow[]>('/api/hostnames?all=1'),
  ])
    .then(([atlas, rows]) => {
      meta = atlas.meta ?? {}
      hostname = rows.find((r) => r.path === path) ?? null
      loaded = fieldsFromMeta(meta)
      form = { ...loaded }
    })
    .catch((err) => (status = errorMessage(err)))
})

export const isSaving = (): boolean => saving

/** Unsaved edits; reactive when read inside a `$derived`. */
export function isDirty(): boolean {
  return JSON.stringify(form) !== JSON.stringify(loaded) || (overrides?.isDirty() ?? false)
}

export function reset(): void {
  form = { ...loaded }
  status = null
  overrides?.reset()
}

/** Why the form can't be saved yet, or null. The server checks all of it again. */
function blocker(): string | null {
  const slug = slugBlocker(verdict, form.slug.trim() || null, loaded.slug.trim() || null)
  if (slug) return slug
  const port = portProblem(form.port)
  return port ? `Dev port: ${port}` : null
}

/** Does `patch` change what the route serves — its slug, port or devPublic? */
const movesRoute = (patch: Meta): boolean =>
  (['slug', 'port', 'devPublic'] as const).some((k) => patch[k] !== (meta[k] ?? null))

/**
 * Writes the form. `'saved'` = done; `'rerouted'` = done and the hostname moved (the caller may
 * stay open so the pill can follow it to live); `null` = not saved, the reason is on the form.
 */
export async function save(): Promise<'saved' | 'rerouted' | null> {
  if (saving) return null
  status = blocker()
  if (status) return null
  saving = true
  const patch = patchFromFields(form)
  // The pill says the NAS is being asked; its poll settles it whichever way the call goes.
  if (hostname && movesRoute(patch)) hostname = { ...hostname, state: 'syncing', error: undefined }

  try {
    const res = await http.patch<{ atlas: Meta; hostname?: HostnameState }>('/api/atlas', {
      path: project.path,
      patch,
    })
    await overrides?.save()
    meta = res.atlas
    loaded = fieldsFromMeta(meta)
    form = { ...loaded }
    onsaved()
    if (!res.hostname) {
      toast('Saved')
      return 'saved'
    }
    hostname = res.hostname
    setChip(project.path, res.hostname)
    toast(`Saved — hostname is now ${hostOf(res.hostname.local)}`)
    return 'rerouted'
  } catch (e) {
    status = errorMessage(e)
    return null
  } finally {
    saving = false
  }
}
</script>

<div class="settings">
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

    <label class="field wide">
      <span class="t-caption">Domains — listed before the detected ones</span>
      <input bind:value={form.domains} placeholder="example.com, www.example.com" />
    </label>

    <label class="field">
      <span class="t-caption">Umami website ids</span>
      <input bind:value={form.umamiIds} placeholder={project.umami?.websiteIds.join(', ') ?? 'none'} />
    </label>

    <label class="field">
      <span class="t-caption">Umami instance</span>
      <input bind:value={form.umamiInstance} placeholder={project.umami?.instance ?? 'default'} />
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

<style>
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
