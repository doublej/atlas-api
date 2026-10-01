<script lang="ts">
import ConfirmDialog from '$lib/components/feedback/ConfirmDialog.svelte'
import Table from '$lib/components/table/Table.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { ArchiveVersion, DiskSettings } from '$lib/disk-types'
import { errorMessage } from '$lib/format'
import { Selection } from '$lib/selection.svelte'
import type { Column } from '$lib/table'
import { TableSort } from '$lib/table-sort.svelte'
import DiskRestoreModal from './DiskRestoreModal.svelte'
import { human, readDisk, runJob } from './disk-client.svelte'

let { archives, settings }: { archives: ArchiveVersion[]; settings: DiskSettings | null } = $props()

const STORAGE = {
  local: 'local only',
  uploading: 'uploading',
  uploaded: 'uploaded',
  cloud: 'cloud only',
  unknown: 'unknown',
  na: 'n/a',
}
const sel = new Selection()
const sort = new TableSort<string>(null, ['size', 'local'])
const columns: Column<ArchiveVersion>[] = [
  { key: 'id', label: 'Version', sort: (v) => v.id, cell: idCell },
  {
    key: 'size',
    width: '5.5rem',
    label: 'Size',
    sort: (v) => v.bytes,
    align: 'right',
    cell: sizeCell,
  },
  {
    key: 'local',
    width: '7rem',
    label: 'On this Mac',
    sort: (v) => v.localBytes,
    align: 'right',
    cell: localCell,
  },
  {
    key: 'storage',
    width: '7rem',
    label: 'Storage',
    sort: (v) => STORAGE[v.storage],
    cell: storageCell,
  },
  {
    key: 'verified',
    width: '6.5rem',
    label: 'Verified',
    sort: (v) => Number(v.verified),
    cell: verifiedCell,
  },
  { key: 'contents', width: '7rem', label: 'Contents', hideLabel: true, cell: contentsCell },
]
let keep = $state(2)
let restoring = $state(false)
let confirmDelete = $state(false)
let confirmPrune = $state(false)
let contents = $state<{ id: string; text: string } | null>(null)

const localBytes = $derived(archives.reduce((n, v) => n + v.localBytes, 0))
const onlyVersion = (v: ArchiveVersion) =>
  archives.filter((x) => x.project === v.project).length === 1
const chosen = $derived(archives.filter((v) => sel.has(v.id)))
const lastOnes = $derived(chosen.filter(onlyVersion).length)

$effect(() => sel.prune(archives.map((v) => v.id)))

async function showContents(id: string) {
  contents = { id, text: 'Reading…' }
  try {
    const d = (await readDisk('archives', 'contents', id)).data as {
      files: { path: string }[]
      leftOut: { excludes: string[]; paths: string[] } | null
    }
    contents = {
      id,
      text: [
        ...d.files.map((f) => f.path),
        '',
        d.leftOut
          ? `Left out (${d.leftOut.excludes.join(', ')}): ${d.leftOut.paths.join(', ') || 'nothing matched'}`
          : 'Left out: unknown (legacy archive)',
      ].join('\n'),
    }
  } catch (e) {
    contents = { id, text: errorMessage(e) }
  }
}

function act(verb: string, ids: string[]) {
  runJob('archives', [verb, ...ids])
  sel.set(ids, false)
}
</script>

{#snippet idCell(v: ArchiveVersion)}<span class="mono">{v.id}</span>{/snippet}
{#snippet sizeCell(v: ArchiveVersion)}<span class="num">{human(v.bytes)}</span>{/snippet}
{#snippet localCell(v: ArchiveVersion)}<span class="num muted">{human(v.localBytes)}</span>{/snippet}
{#snippet storageCell(v: ArchiveVersion)}
  <Badge tone={v.storage === 'local' ? 'warn' : 'neutral'}>{STORAGE[v.storage]}</Badge>
{/snippet}
{#snippet verifiedCell(v: ArchiveVersion)}
  {#if v.verified}<Badge tone="pos">verified</Badge>{:else}<Badge tone="neg" title={v.verifyNote}>unverified</Badge>{/if}
{/snippet}
{#snippet contentsCell(v: ArchiveVersion)}<Button onclick={() => showContents(v.id)}>Contents</Button>{/snippet}
{#snippet noArchives()}No archives yet.{/snippet}

<section>
  <div class="bar">
    <h2 class="t-h3">Archives</h2>
    <span class="t-caption muted">{archives.length} versions in <span class="mono">{settings?.archiveDir}</span> · {human(localBytes)} on this Mac</span>
  </div>
  <div class="bar">
    <Button variant="primary" disabled={!sel.size} onclick={() => (restoring = true)}>Restore ({sel.size})</Button>
    <Button disabled={!sel.size} onclick={() => act('check', sel.list)}>Check</Button>
    <Button disabled={!sel.size} onclick={() => act('evict', sel.list)}>Evict</Button>
    <Button variant="danger" disabled={!sel.size} onclick={() => (confirmDelete = true)}>Delete</Button>
    <span class="spacer"></span>
    <label class="t-small">keep newest <input class="num keep" type="number" min="1" bind:value={keep} /></label>
    <Button variant="danger" onclick={() => (confirmPrune = true)}>Prune</Button>
  </div>

  <Card flush>
    <Table
      label="Archive versions"
      rows={archives}
      key={(v) => v.id}
      {columns}
      {sort}
      selection={sel}
      empty={noArchives}
      maxHeight="70vh"
    />
  </Card>
</section>

{#if restoring}
  <DiskRestoreModal versions={chosen} onclose={() => (restoring = false)} ondone={() => sel.clear()} />
{/if}

<ConfirmDialog
  open={confirmDelete}
  title="Delete {chosen.length} archive version(s)?"
  message={lastOnes
    ? `This cannot be undone, and ${lastOnes} of these ${lastOnes === 1 ? 'is the ONLY version of its project' : 'are the ONLY version of their project'}.`
    : 'This cannot be undone.'}
  items={chosen.map((v) => `${v.id} · ${human(v.bytes)}${onlyVersion(v) ? ' — the only version' : ''}`)}
  confirmLabel="Delete"
  danger
  onconfirm={() => act('delete', sel.list)}
  onclose={() => (confirmDelete = false)}
/>

<ConfirmDialog
  open={confirmPrune}
  title="Prune archives?"
  message="Keeps the newest {keep} version(s) of each project and deletes the older ones. A project's only version is never deleted."
  confirmLabel="Prune"
  danger
  onconfirm={() => runJob('archives', ['prune', '--keep', String(keep)])}
  onclose={() => (confirmPrune = false)}
/>

<Modal open={contents !== null} title={contents?.id ?? ''} wide onclose={() => (contents = null)}>
  <pre class="mono t-small contents">{contents?.text}</pre>
  {#snippet footer()}
    <Button onclick={() => (contents = null)}>Close</Button>
  {/snippet}
</Modal>

<style>
  .keep {
    width: 56px;
  }

  .contents {
    max-height: 60vh;
    margin: 0;
    overflow: auto;
  }
</style>
