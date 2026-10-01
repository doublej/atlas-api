<script lang="ts">
import SortHeader from '$lib/components/table/SortHeader.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import Chip from '$lib/components/ui/Chip.svelte'
import type { Risk, Scan } from '$lib/disk-types'
import { tildify } from '$lib/format'
import { Selection } from '$lib/selection.svelte'
import { TableSort } from '$lib/table-sort.svelte'
import DiskCleanModal from './DiskCleanModal.svelte'
import { ago, human, runJob } from './disk-client.svelte'

let { scan }: { scan: Scan | null } = $props()

const RISKS: { id: Risk; tone: 'pos' | 'warn' | 'neg'; note: string }[] = [
  { id: 'rebuildable', tone: 'pos', note: 'the build recreates it' },
  { id: 'reinstallable', tone: 'warn', note: 'a package install brings it back' },
  { id: 'review', tone: 'neg', note: 'look before it goes — Trash by default' },
]

let shown = $state(new Set<Risk>(['rebuildable', 'reinstallable', 'review']))
let reviewing = $state(false)
const sel = new Selection()
/** One sort for every risk group, so the groups stay comparable. */
const sort = new TableSort<'size' | 'path' | 'inUse' | 'why' | 'restore'>(null, ['size'])

const groups = $derived(
  RISKS.filter((r) => shown.has(r.id))
    .map((r) => ({
      ...r,
      rows: sort.apply(
        (scan?.folders ?? []).filter((f) => f.risk === r.id),
        {
          size: (f) => f.bytes,
          path: (f) => f.path,
          inUse: (f) => f.inUse,
          why: (f) => f.why,
          restore: (f) => f.restore,
        },
      ),
    }))
    .filter((g) => g.rows.length),
)
const ordered = $derived(groups.flatMap((g) => g.rows.map((r) => r.path)))
const chosen = $derived((scan?.folders ?? []).filter((f) => sel.has(f.path)))

$effect(() => sel.prune((scan?.folders ?? []).map((f) => f.path)))

function toggleRisk(r: Risk) {
  const next = new Set(shown)
  next.has(r) ? next.delete(r) : next.add(r)
  shown = next
}
</script>

<section>
  <div class="bar">
    <h2 class="t-h3">Cleanup</h2>
    <span class="t-caption muted">
      {scan ? `${human(scan.totalBytes)} in ${scan.folders.length} folders · scan ${ago(scan.ranAt)}` : 'no scan yet'}
    </span>
    <span class="spacer"></span>
    <Button onclick={() => runJob('scan', [])}>Scan</Button>
    <Button variant="primary" disabled={!sel.size} onclick={() => (reviewing = true)}>Review ({sel.size})</Button>
  </div>
  <div class="bar">
    {#each RISKS as r (r.id)}
      <Chip pressed={shown.has(r.id)} onclick={() => toggleRisk(r.id)}>{r.id}</Chip>
    {/each}
  </div>

  {#each groups as g (g.id)}
    <Card flush>
      <div class="group t-small">
        <input
          type="checkbox"
          aria-label="Select all {g.id}"
          checked={g.rows.every((r) => sel.has(r.path))}
          onchange={(e) => sel.set(g.rows.filter((r) => !r.nested).map((r) => r.path), e.currentTarget.checked)}
        />
        <Badge tone={g.tone}>{g.id}</Badge>
        <span class="muted">{g.note} · {g.rows.length} folders</span>
      </div>
      <div class="scroll">
        <table>
          <thead>
            <tr class="t-caption">
              <th></th>
              <SortHeader {sort} key="size" label="Size" class="right" />
              <SortHeader {sort} key="path" label="Folder" />
              <SortHeader {sort} key="inUse" label="In use" />
              <SortHeader {sort} key="why" label="What it is" />
              <SortHeader {sort} key="restore" label="How it comes back" />
            </tr>
          </thead>
          <tbody>
            {#each g.rows as f (f.path)}
              <tr class="t-small" class:selected={sel.has(f.path)} class:dim={f.nested} onclick={(e) => sel.click(f.path, e, ordered)}>
                <td><input type="checkbox" aria-label="Select {f.path}" checked={sel.has(f.path)} onclick={(e) => e.stopPropagation()} onchange={() => sel.toggle(f.path)} /></td>
                <td class="num right">{human(f.bytes)}</td>
                <td class="mono" title={f.path}>{tildify(f.path)}{f.nested ? ' (nested)' : ''}</td>
                <td>{#if f.inUse}<Badge tone="warn" title="something seems to use it">in use: {f.inUse}</Badge>{/if}</td>
                <td class="muted">{f.why}</td>
                <td class="muted mono">{f.restore}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Card>
  {:else}
    <p class="t-small muted">{scan ? 'Nothing at these risk levels.' : 'Run a scan to list rebuildable folders under your home folder.'}</p>
  {/each}
</section>

{#if reviewing}
  <DiskCleanModal rows={chosen} onclose={() => (reviewing = false)} ondone={() => sel.clear()} />
{/if}

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  section .bar {
    margin-bottom: 0;
  }

  .group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
  }
</style>
