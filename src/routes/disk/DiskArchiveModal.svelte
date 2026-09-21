<script lang="ts">
import { untrack } from 'svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { DiskItem } from '$lib/disk'
import type { DiskSettings, ProjectRow } from '$lib/disk-types'
import { human, readDisk, runJob } from './disk-client.svelte'

let {
  rows,
  settings,
  onclose,
  ondone,
}: { rows: ProjectRow[]; settings: DiskSettings; onclose: () => void; ondone: () => void } =
  $props()

type PlanRow = ProjectRow & { dest: string }

let plan = $state<PlanRow[]>([])
let refused = $state<DiskItem[]>([])
let error = $state('')
let loading = $state(true)
let keepRebuildable = $state(false)
let compression = $state(
  untrack(() =>
    settings.compression === 0 ? 'none' : settings.compression >= 19 ? 'strong' : 'fast',
  ),
)
let to = $state(untrack(() => settings.archiveDir))
/** Dirty or unpushed projects each need their own tick → `--confirm-dirty <id>`. */
let dirtyOk = $state(new Set<string>())

const risky = (p: ProjectRow) => p.dirty || p.push === 'unpushed'
const total = $derived(plan.reduce((n, p) => n + p.bytes, 0))

$effect(() => {
  const ids = untrack(() => rows.map((r) => r.id))
  readDisk('archive', ...ids, '--dry-run')
    .then((r) => {
      const d = r.data as { plan: PlanRow[]; refused: DiskItem[] }
      plan = d.plan
      refused = d.refused
    })
    .catch((e: Error) => (error = e.message))
    .finally(() => (loading = false))
})

function toggleDirty(id: string, on: boolean) {
  const next = new Set(dirtyOk)
  on ? next.add(id) : next.delete(id)
  dirtyOk = next
}

function confirm() {
  const args = [
    ...plan.map((p) => p.id),
    '--compression',
    compression,
    ...(keepRebuildable ? ['--keep-rebuildable'] : []),
    ...(to.trim() && to.trim() !== settings.archiveDir ? ['--to', to.trim()] : []),
    ...[...dirtyOk].flatMap((id) => ['--confirm-dirty', id]),
  ]
  runJob('archive', args)
  ondone()
  onclose()
}
</script>

<Modal open title="Archive {rows.length} project(s)" wide {onclose}>
  {#if loading}
    <p class="t-small muted">Measuring…</p>
  {:else if error}
    <p class="t-small err">{error}</p>
  {:else}
    <div class="scroll">
      <table>
        <tbody>
          {#each plan as p (p.id)}
            <tr class="t-small">
              <td class="mono">{p.id}</td>
              <td class="num right">{human(p.bytes)}</td>
              <td>
                {#if risky(p)}
                  <label class="dirty">
                    <input type="checkbox" checked={dirtyOk.has(p.id)} onchange={(e) => toggleDirty(p.id, e.currentTarget.checked)} />
                    <Badge tone="warn">{[p.dirty && 'uncommitted', p.push === 'unpushed' && 'unpushed'].filter(Boolean).join(', ')}</Badge>
                    archive anyway
                  </label>
                {/if}
              </td>
            </tr>
          {/each}
          {#each refused as r (r.item)}
            <tr class="t-small dim">
              <td class="mono">{r.item}</td>
              <td colspan="2" class="wrap">{r.outcome}: {r.reason}{r.needs ? ` (needs ${r.needs})` : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="t-small">
      Frees up to <span class="num">{human(total)}</span> on this Mac. Archives stay local until uploaded
      and evicted. Unticked dirty projects are refused.
    </p>
    <div class="bar t-small">
      <label><input type="checkbox" bind:checked={keepRebuildable} /> keep rebuildable folders</label>
      <label>compression
        <select bind:value={compression}>
          <option value="none">none</option>
          <option value="fast">fast</option>
          <option value="strong">strong</option>
        </select>
      </label>
    </div>
    <label class="t-small dest">to <input class="mono" bind:value={to} /></label>
  {/if}
  {#snippet footer()}
    <Button onclick={onclose}>Cancel</Button>
    <Button variant="primary" disabled={loading || !plan.length} onclick={confirm}>Archive {plan.length}</Button>
  {/snippet}
</Modal>

<style>
  .dirty {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .dest {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .dest input {
    flex: 1;
  }
</style>
