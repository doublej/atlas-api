<script lang="ts">
import { untrack } from 'svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import Table from '$lib/components/table/Table.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { DiskItem } from '$lib/disk'
import type { DiskSettings, ProjectRow } from '$lib/disk-types'
import { errorMessage, tildify } from '$lib/format'
import type { Column } from '$lib/table'
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
/** What the CLI will actually archive: a risky project without its tick is skipped. */
const going = $derived(plan.filter((p) => !risky(p) || dirtyOk.has(p.id)))
const total = $derived(going.reduce((n, p) => n + p.bytes, 0))
const title = $derived(
  rows.length === 1 ? `Archive ${rows[0].id.split('/').pop()}` : `Archive ${rows.length} projects`,
)
const folder = $derived(
  tildify(to.replace(/^.*\/Mobile Documents\/com~apple~CloudDocs/, 'iCloud Drive')),
)
const icloud = $derived(folder.startsWith('iCloud Drive'))

function riskText(p: ProjectRow) {
  if (p.dirty && p.push === 'unpushed') return 'Uncommitted changes and unpushed commits'
  return p.dirty ? 'Uncommitted changes' : 'Unpushed commits'
}

$effect(() => {
  const ids = untrack(() => rows.map((r) => r.id))
  readDisk('archive', ...ids, '--dry-run')
    .then((r) => {
      const d = r.data as { plan: PlanRow[]; refused: DiskItem[] }
      plan = d.plan
      refused = d.refused
    })
    .catch((e) => (error = errorMessage(e)))
    .finally(() => (loading = false))
})

/** A planned project or a refused one; a risky project's tick lives in its note cell. */
type Row = { id: string; bytes?: number; plan?: PlanRow; skipped?: string }
const lines = $derived<Row[]>([
  ...plan.map((p) => ({ id: p.id, bytes: p.bytes, plan: p })),
  ...refused.map((r) => ({
    id: r.item,
    skipped: `Skipped: ${r.reason}${r.needs ? ` (needs ${r.needs})` : ''}`,
  })),
])
const columns: Column<Row>[] = [
  { key: 'project', label: 'Project', cell: projectCell },
  { key: 'size', label: 'Size', align: 'right', cell: sizeCell },
  { key: 'note', label: 'Note', wrap: true, cell: noteCell },
]
const skipped = (r: Row) => !r.plan || (risky(r.plan) && !dirtyOk.has(r.id))

function toggleDirty(id: string, on: boolean) {
  const next = new Set(dirtyOk)
  on ? next.add(id) : next.delete(id)
  dirtyOk = next
}

function confirm() {
  const args = [
    ...going.map((p) => p.id),
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

{#snippet projectCell(r: Row)}<span class="mono">{r.id}</span>{/snippet}
{#snippet sizeCell(r: Row)}<span class="num">{r.bytes === undefined ? '' : human(r.bytes)}</span>{/snippet}
{#snippet noteCell(r: Row)}
  {#if r.plan && risky(r.plan)}
    <label class="risk">
      <input type="checkbox" checked={dirtyOk.has(r.id)} onchange={(e) => toggleDirty(r.id, e.currentTarget.checked)} />
      <span><strong class="warn">{riskText(r.plan)}</strong> live only in this folder. Tick to
        archive anyway, otherwise it is skipped.</span>
    </label>
  {:else if r.skipped}
    {r.skipped}
  {/if}
{/snippet}

<Modal open {title} wide {onclose}>
  <PageState {loading} loadingText="Measuring…" {error} empty={!!error}>
    <p class="t-small muted">
      Each project is packed into one compressed file, checked, and then removed from ~/dev. You can
      restore it any time under Archives.
    </p>
    <Table label="Projects to archive" rows={lines} key={(r) => r.id} {columns} dim={skipped} />
    {#if going.length}
      <p class="t-small">
        Frees up to <strong class="num">{human(total)}</strong> on this Mac.
        {#if icloud}The archive file keeps using some space until iCloud Drive has uploaded it.{/if}
      </p>
    {:else}
      <p class="t-small muted">Nothing to archive yet. Tick a project above to include it.</p>
    {/if}
    <details class="t-small">
      <summary>
        Options <span class="muted">· {compression} compression · {keepRebuildable ? 'exact copy' : 'dependencies left out'} · {folder}</span>
      </summary>
      <label class="opt">
        <input type="checkbox" bind:checked={keepRebuildable} />
        <span>Include dependencies and build output
          <span class="t-caption">node_modules, .venv, build folders, caches. Left out by default because they
            reinstall; tick for an exact copy (bigger archive).</span></span>
      </label>
      <label class="opt">
        <span>Compression</span>
        <select bind:value={compression}>
          <option value="fast">Fast (recommended)</option>
          <option value="strong">Strong: smaller file, slower</option>
          <option value="none">None: biggest file, quickest</option>
        </select>
      </label>
      <label class="opt dest">
        <span>Save to</span>
        <input class="mono" bind:value={to} />
      </label>
    </details>
  </PageState>
  {#snippet footer()}
    <Button onclick={onclose}>Cancel</Button>
    <Button variant="primary" disabled={loading || !going.length} onclick={confirm}>
      Archive {going.length} {going.length === 1 ? 'project' : 'projects'}
    </Button>
  {/snippet}
</Modal>

<style>
  .risk,
  .opt {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .warn {
    color: var(--color-warn);
    font-weight: 500;
  }

  .opt {
    margin-top: var(--space-2);
  }

  .opt .t-caption {
    display: block;
  }

  summary {
    cursor: pointer;
  }

  .dest input {
    flex: 1;
  }
</style>
