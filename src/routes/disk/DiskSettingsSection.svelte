<script lang="ts">
import { untrack } from 'svelte'
import { invalidateAll } from '$app/navigation'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import type { DiskSettings } from '$lib/disk-types'
import { send } from './disk-client.svelte'

let { settings }: { settings: DiskSettings } = $props()

type NumKey = {
  [K in keyof DiskSettings]: DiskSettings[K] extends number ? K : never
}[keyof DiskSettings]
const NUMBERS: { key: NumKey; label: string; unit: string }[] = [
  { key: 'activeDays', label: 'Active within', unit: 'days' },
  { key: 'archiveAgeDays', label: 'Archive-eligible after', unit: 'days idle' },
  { key: 'archiveMinMB', label: 'Archive-eligible from', unit: 'MB' },
  { key: 'compression', label: 'Compression', unit: 'zstd 0–19 (0 none · 1 fast · 19 strong)' },
  { key: 'scanMinMB', label: 'Cleanup scan lists from', unit: 'MB' },
  { key: 'rustSweepDays', label: 'Rust sweep: untouched for', unit: 'days' },
  { key: 'rustSweepMax', label: 'Rust sweep: at most', unit: 'projects' },
  { key: 'stepTimeoutSec', label: 'Trim step timeout', unit: 'seconds' },
  { key: 'notifyTotalGB', label: 'Warn when reclaimable reaches', unit: 'GB' },
  { key: 'notifyGrowthGB', label: 'Warn when it grows by', unit: 'GB per scan' },
]

// Seeded once from the server payload, then owned by the form — `untrack` says so out loud.
let form = $state(
  untrack(() => ({
    ...settings,
    skip: settings.skipCategories.join(', '),
    keep: settings.keepNewest === null ? '' : String(settings.keepNewest),
  })),
)
let saving = $state(false)
let saved = $state(false)
let saveError = $state('')

function changes(): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...Object.fromEntries(NUMBERS.map((n) => [n.key, Number(form[n.key])])),
    archiveDir: form.archiveDir.trim(),
    skipCategories: form.skip
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    keepNewest: form.keep.trim() === '' ? null : Number(form.keep),
    autoCleanRebuildable: form.autoCleanRebuildable,
    rustSweep: form.rustSweep,
  }
  return Object.fromEntries(
    Object.entries(next).filter(
      ([k, v]) => JSON.stringify(v) !== JSON.stringify(settings[k as keyof DiskSettings]),
    ),
  )
}

async function save() {
  const bad = NUMBERS.find((n) => !Number.isFinite(Number(form[n.key])) || Number(form[n.key]) < 0)
  saveError = bad
    ? `${bad.label} needs a non-negative number`
    : form.keep.trim() && !(Number(form.keep) >= 1)
      ? 'Keep newest is empty (off) or at least 1'
      : ''
  if (saveError) return
  saving = true
  saved = false
  saveError = ''
  try {
    await send('/api/disk/config', 'PUT', { changes: changes() })
    saved = true
    await invalidateAll()
  } catch (e) {
    saveError = (e as Error).message
  } finally {
    saving = false
  }
}
</script>

<section>
  <div class="bar">
    <h2 class="t-h3">Settings</h2>
    <span class="t-caption muted"><span class="mono">atlas disk config</span> — dev folder <span class="mono">{settings.devRoot}</span></span>
  </div>
  <Card>
    <div class="grid t-small">
      {#each NUMBERS as n (n.key)}
        <label for="s-{n.key}">{n.label}</label>
        <span><input id="s-{n.key}" class="num" type="number" min="0" bind:value={form[n.key]} /> <span class="muted">{n.unit}</span></span>
      {/each}
      <label for="s-keep">Keep newest</label>
      <span><input id="s-keep" class="num" placeholder="off" bind:value={form.keep} /> <span class="muted">versions per project (empty = never prune)</span></span>
      <label for="s-dir">Archive location</label>
      <input id="s-dir" class="mono" bind:value={form.archiveDir} />
      <label for="s-skip">Skipped categories</label>
      <input id="s-skip" class="mono" bind:value={form.skip} />
      <span>Standing rules</span>
      <span class="rules">
        <label><input type="checkbox" bind:checked={form.autoCleanRebuildable} /> clean rebuildable folders without asking (unattended)</label>
        <label><input type="checkbox" bind:checked={form.rustSweep} /> include the Rust sweep in every trim</label>
      </span>
    </div>
    <div class="bar foot">
      <Button variant="primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
      {#if saved}<span class="t-caption ok">Saved.</span>{/if}
    </div>
    {#if saveError}<p class="t-caption err">{saveError}</p>{/if}
  </Card>
</section>

<style>
  .grid {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--space-2) var(--space-4);
    align-items: center;
  }

  .grid input.num {
    width: 88px;
  }

  .rules {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .foot {
    margin: var(--space-4) 0 0;
    padding-top: var(--space-4);
    border-top: var(--hairline) solid var(--color-border-soft);
  }

  @media (max-width: 768px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
