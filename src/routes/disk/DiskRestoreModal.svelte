<script lang="ts">
import { untrack } from 'svelte'
import Notice from '$lib/components/feedback/Notice.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Modal from '$lib/components/ui/Modal.svelte'
import type { DiskItem } from '$lib/disk'
import type { ArchiveVersion } from '$lib/disk-types'
import { errorMessage } from '$lib/format'
import { human, readDisk, runJob } from './disk-client.svelte'

let {
  versions,
  onclose,
  ondone,
}: { versions: ArchiveVersion[]; onclose: () => void; ondone: () => void } = $props()

let plan = $state<ArchiveVersion[]>([])
let skipped = $state<DiskItem[]>([])
let message = $state('')
let error = $state('')
let loading = $state(true)
let keepArchive = $state(true)

$effect(() => {
  const ids = untrack(() => versions.map((v) => v.id))
  readDisk('restore', ...ids, '--dry-run')
    .then((r) => {
      const d = r.data as { plan: ArchiveVersion[]; skipped: DiskItem[] } | undefined
      plan = d?.plan ?? []
      skipped = d?.skipped ?? []
      message = r.message ?? ''
    })
    .catch((e) => (error = errorMessage(e)))
    .finally(() => (loading = false))
})

function confirm() {
  runJob('restore', [...plan.map((v) => v.id), ...(keepArchive ? ['--keep-archive'] : [])])
  ondone()
  onclose()
}
</script>

<Modal open title="Restore {versions.length} version(s)" wide {onclose}>
  <PageState {loading} loadingText="Planning…" {error} empty={!!error}>
    {#if message}<Notice tone="warn">{message}</Notice>{/if}
    <ul class="t-small">
      {#each plan as v (v.id)}
        <li>
          <span class="mono">{v.id}</span> · {human(v.bytes)}
          {#if v.storage === 'cloud'} · downloads first{/if}
          {#if !v.verified}<Badge tone="neg">not verified</Badge> {v.verifyNote}{/if}
        </li>
      {/each}
      {#each skipped as s (s.item)}
        <li class="muted"><span class="mono">{s.item}</span> — {s.outcome}: {s.reason}</li>
      {/each}
    </ul>
    <label class="t-small"><input type="checkbox" bind:checked={keepArchive} /> keep the archive after restoring</label>
  </PageState>
  {#snippet footer()}
    <Button onclick={onclose}>Cancel</Button>
    <Button variant="primary" disabled={loading || !plan.length} onclick={confirm}>Restore {plan.length}</Button>
  {/snippet}
</Modal>
