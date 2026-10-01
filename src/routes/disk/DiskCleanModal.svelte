<script lang="ts">
import { untrack } from 'svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { FolderRow, Preview } from '$lib/disk-types'
import { errorMessage, tildify } from '$lib/format'
import { human, readDisk, runJob } from './disk-client.svelte'

let { rows, onclose, ondone }: { rows: FolderRow[]; onclose: () => void; ondone: () => void } =
  $props()

let previews = $state<Preview[]>([])
let error = $state('')
let loading = $state(true)
/** Review-level folders go to the Trash unless this is switched to permanent. */
let reviewTo = $state<'trash' | 'permanent'>('trash')

// Selecting a parent covers its children: the CLI drops them, and so does the total.
const plan = $derived(rows.filter((r) => !rows.some((p) => r.path.startsWith(`${p.path}/`))))
const total = $derived(plan.reduce((n, r) => n + r.bytes, 0))
const toTrash = (r: FolderRow) => r.risk === 'review' && reviewTo === 'trash'
const hasReview = $derived(plan.some((r) => r.risk === 'review'))
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

$effect(() => {
  const paths = untrack(() => rows.map((r) => r.path))
  readDisk('clean', ...paths, '--dry-run')
    .then((r) => (previews = (r.data as { preview: Preview[] }).preview))
    .catch((e) => (error = errorMessage(e)))
    .finally(() => (loading = false))
})

function confirm() {
  // No flag = the CLI's default (review → Trash, the rest permanent); --trash would send every folder there.
  runJob('clean', [
    ...plan.map((r) => r.path),
    ...(hasReview && reviewTo === 'permanent' ? ['--permanent'] : []),
  ])
  ondone()
  onclose()
}
</script>

<Modal open title="Delete {plan.length} folder(s) · {human(total)}" wide {onclose}>
  {#if loading}
    <p class="t-small muted">Looking inside…</p>
  {:else if error}
    <p class="t-small err">{error}</p>
  {:else}
    <div class="previews">
      {#each plan as r (r.path)}
        {@const p = previews.find((x) => x.path === r.path)}
        <div class="t-small preview">
          <div>
            <span class="mono">{tildify(r.path)}</span> · <span class="num">{human(r.bytes)}</span> · {r.risk}
            · <strong>{toTrash(r) ? 'to the Trash' : 'deleted permanently'}</strong>
            {#if r.inUse}<Badge tone="warn">in use: {r.inUse}</Badge>{/if}
          </div>
          <div class="muted">{r.why} · get it back: <span class="mono">{r.restore}</span></div>
          {#if p}
            <div class="mono muted">contains ({p.entries.length}): {p.entries.slice(0, 20).join('  ')}{p.entries.length > 20 ? `  … +${p.entries.length - 20} more` : ''}</div>
            <div class="mono muted">newest: {p.newest.map((f) => `${day(f.mtime)} ${f.path}`).join(' · ') || '–'}</div>
          {/if}
        </div>
      {/each}
    </div>
    {#if hasReview}
      <label class="t-small">review-level folders go
        <select bind:value={reviewTo}>
          <option value="trash">to the Trash (Put Back works)</option>
          <option value="permanent">away permanently</option>
        </select>
      </label>
    {/if}
    <p class="t-small">Each folder is re-checked against the scan just before it goes; a changed one is skipped.</p>
  {/if}
  {#snippet footer()}
    <Button onclick={onclose}>Cancel</Button>
    <Button variant="danger" disabled={loading || !!error || !plan.length} onclick={confirm}>Delete {plan.length}</Button>
  {/snippet}
</Modal>

<style>
  .previews {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-height: 50vh;
    overflow: auto;
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: var(--space-2);
    border-bottom: var(--hairline) solid var(--color-border-soft);
    overflow-wrap: anywhere;
  }
</style>
