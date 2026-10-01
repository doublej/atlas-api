<script lang="ts">
import SortHeader from '$lib/components/table/SortHeader.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { ArchiveVersion, DiskSettings } from '$lib/disk-types'
import { Selection } from '$lib/selection.svelte'
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
const sort = new TableSort<'id' | 'size' | 'local' | 'storage' | 'verified'>(null, [
  'size',
  'local',
])
const rows = $derived(
  sort.apply(archives, {
    id: (v) => v.id,
    size: (v) => v.bytes,
    local: (v) => v.localBytes,
    storage: (v) => STORAGE[v.storage],
    verified: (v) => Number(v.verified),
  }),
)
let keep = $state(2)
let restoring = $state(false)
let confirmDelete = $state(false)
let confirmPrune = $state(false)
let contents = $state<{ id: string; text: string } | null>(null)

const ordered = $derived(rows.map((v) => v.id))
const localBytes = $derived(archives.reduce((n, v) => n + v.localBytes, 0))
const onlyVersion = (v: ArchiveVersion) =>
  archives.filter((x) => x.project === v.project).length === 1
const chosen = $derived(archives.filter((v) => sel.has(v.id)))

$effect(() => sel.prune(ordered))

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
    contents = { id, text: (e as Error).message }
  }
}

function act(verb: string, ids: string[]) {
  runJob('archives', [verb, ...ids])
  sel.set(ids, false)
}
</script>

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
    <div class="scroll">
      <table>
        <thead>
          <tr class="t-caption">
            <th></th>
            <SortHeader {sort} key="id" label="Version" />
            <SortHeader {sort} key="size" label="Size" class="right" />
            <SortHeader {sort} key="local" label="On this Mac" class="right" />
            <SortHeader {sort} key="storage" label="Storage" />
            <SortHeader {sort} key="verified" label="Verified" />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as v (v.id)}
            <tr class="t-small" class:selected={sel.has(v.id)} onclick={(e) => sel.click(v.id, e, ordered)}>
              <td><input type="checkbox" aria-label="Select {v.id}" checked={sel.has(v.id)} onclick={(e) => e.stopPropagation()} onchange={(e) => sel.set([v.id], e.currentTarget.checked)} /></td>
              <td class="mono">{v.id}</td>
              <td class="num right">{human(v.bytes)}</td>
              <td class="num right muted">{human(v.localBytes)}</td>
              <td><Badge tone={v.storage === 'local' ? 'warn' : 'neutral'}>{STORAGE[v.storage]}</Badge></td>
              <td>
                {#if v.verified}<Badge tone="pos">verified</Badge>{:else}<Badge tone="neg" title={v.verifyNote}>unverified</Badge>{/if}
              </td>
              <td><Button onclick={(e: MouseEvent) => (e.stopPropagation(), showContents(v.id))}>Contents</Button></td>
            </tr>
          {:else}
            <tr><td colspan="7" class="t-small muted">No archives yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </Card>
</section>

{#if restoring}
  <DiskRestoreModal versions={chosen} onclose={() => (restoring = false)} ondone={() => sel.clear()} />
{/if}

<Modal open={confirmDelete} title="Delete {chosen.length} archive version(s)?" onclose={() => (confirmDelete = false)}>
  <ul class="t-small mono">
    {#each chosen as v (v.id)}
      <li>{v.id} · {human(v.bytes)}{#if onlyVersion(v)} <strong class="err">— the ONLY version of this project</strong>{/if}</li>
    {/each}
  </ul>
  <p class="t-small err">This cannot be undone.</p>
  {#snippet footer()}
    <Button onclick={() => (confirmDelete = false)}>Cancel</Button>
    <Button variant="danger" onclick={() => ((confirmDelete = false), act('delete', sel.list))}>Delete</Button>
  {/snippet}
</Modal>

<Modal open={confirmPrune} title="Prune archives?" onclose={() => (confirmPrune = false)}>
  <p class="t-small">Keeps the newest {keep} version(s) of each project and deletes the older ones. A project's only version is never deleted.</p>
  {#snippet footer()}
    <Button onclick={() => (confirmPrune = false)}>Cancel</Button>
    <Button variant="danger" onclick={() => ((confirmPrune = false), runJob('archives', ['prune', '--keep', String(keep)]))}>Prune</Button>
  {/snippet}
</Modal>

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
