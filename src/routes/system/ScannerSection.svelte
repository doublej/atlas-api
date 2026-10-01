<script lang="ts">
import { untrack } from 'svelte'
import type { AtlasConfig } from '$lib/atlasFile'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'

let { config }: { config: AtlasConfig } = $props()

// Seeded once from the server payload, then owned by the form — `untrack` says so out loud.
let maxDepth = $state(untrack(() => config.maxDepth))
let depthRows = $state(
  untrack(() => Object.entries(config.depth).map(([k, v]) => ({ k, v: String(v) }))),
)
let forceRows = $state(untrack(() => Object.entries(config.force).map(([k, v]) => ({ k, v }))))
let ignoreRows = $state(untrack(() => config.ignore.map((pattern) => ({ pattern }))))

let saving = $state(false)
let saved = $state(false)
let saveError = $state('')

let rescanning = $state(false)
let rescanError = $state('')

async function save() {
  const bad = depthRows.find((r) => r.k.trim() && !Number.isInteger(Number(r.v)))
  if (bad) {
    saveError = `depth "${bad.k}" is not an integer — the server would drop that row silently`
    return
  }
  saving = true
  saved = false
  saveError = ''
  try {
    await http.put('/api/config', {
      maxDepth: Number(maxDepth),
      depth: Object.fromEntries(
        depthRows.filter((r) => r.k.trim()).map((r) => [r.k.trim(), Number(r.v)]),
      ),
      force: Object.fromEntries(forceRows.filter((r) => r.k.trim()).map((r) => [r.k.trim(), r.v])),
      ignore: ignoreRows.map((r) => r.pattern.trim()).filter(Boolean),
    })
    saved = true
  } catch (e) {
    saveError = errorMessage(e)
  } finally {
    saving = false
  }
}

async function rescan() {
  rescanning = true
  rescanError = ''
  try {
    await http.post('/api/refresh?force=true')
    saved = false
  } catch (e) {
    rescanError = errorMessage(e)
  } finally {
    rescanning = false
  }
}
</script>

<section>
  <header>
    <h2 class="t-h3">Scanner</h2>
    <span class="t-small muted">
      <code class="mono">.atlas-config.json</code> — the walk limits the detectors obey
    </span>
  </header>

  <Card>
    <label class="depth t-small">
      maxDepth
      <input type="number" min="1" max="12" bind:value={maxDepth} />
      <span class="t-caption muted">levels below the scan root · 1–12</span>
    </label>

    <div class="table">
      <div class="table-head">
        <h3 class="t-small">depth</h3>
        <p class="t-caption muted">
          Walk limit for one subtree, absolute from the root — and the only way to catalog a project
          that lives <em>inside</em> another project.
        </p>
      </div>
      {#each depthRows as row, i (i)}
        <div class="row">
          <input class="mono" bind:value={row.k} placeholder="python/suna" />
          <input class="mono num-input" type="number" bind:value={row.v} />
          <Button variant="danger" onclick={() => depthRows.splice(i, 1)}>Remove</Button>
        </div>
      {/each}
      <Button onclick={() => depthRows.push({ k: '', v: '4' })}>Add depth override</Button>
    </div>

    <div class="table">
      <div class="table-head">
        <h3 class="t-small">force</h3>
        <p class="t-caption muted">
          Promotes or demotes a folder the detectors got wrong — <code class="mono">true</code> is
          always a project, <code class="mono">false</code> is never one and keeps walking through.
        </p>
      </div>
      {#each forceRows as row, i (i)}
        <div class="row">
          <input class="mono" bind:value={row.k} placeholder="web/marktplaats" />
          <select bind:value={row.v}>
            <option value={true}>true</option>
            <option value={false}>false</option>
          </select>
          <Button variant="danger" onclick={() => forceRows.splice(i, 1)}>Remove</Button>
        </div>
      {/each}
      <Button onclick={() => forceRows.push({ k: '', v: true })}>Add force override</Button>
    </div>

    <div class="table">
      <div class="table-head">
        <h3 class="t-small">ignore</h3>
        <p class="t-caption muted">
          Folders the walk skips whole — not catalogued, not descended into. A bare name matches at
          any depth and takes its subtree with it, a leading <code class="mono">/</code> anchors to
          the root. Applies to this machine's scan; remote hosts keep their own (empty) config.
        </p>
      </div>
      {#each ignoreRows as row, i (i)}
        <div class="row">
          <input class="mono wide" bind:value={row.pattern} placeholder="app-worktrees" />
          <Button variant="danger" onclick={() => ignoreRows.splice(i, 1)}>Remove</Button>
        </div>
      {/each}
      <Button onclick={() => ignoreRows.push({ pattern: '' })}>Add ignore pattern</Button>
    </div>

    <div class="foot">
      <Button variant="primary" onclick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save config'}
      </Button>
      {#if saved}
        <span class="t-caption ok">Saved. A rescan is what applies it.</span>
        <Button onclick={rescan} disabled={rescanning}>
          {rescanning ? 'Rescanning…' : 'Rescan now'}
        </Button>
      {/if}
    </div>
    {#if saveError}
      <p class="t-caption err">{saveError}</p>
    {/if}
    {#if rescanError}
      <p class="t-caption err">{rescanError}</p>
    {/if}
  </Card>
</section>

<style>
  header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }

  .depth {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-bottom: var(--space-5);
  }
  .depth input {
    width: 72px;
  }

  .table {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding-top: var(--space-4);
    border-top: var(--hairline) solid var(--color-border-soft);
    margin-bottom: var(--space-4);
  }
  .table-head h3 {
    font-weight: 600;
    margin-bottom: 2px;
  }
  .table-head p {
    max-width: 62ch;
  }

  .row .wide {
    grid-column: 1 / -2;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
  }
  .row input:first-child {
    flex: 1;
    min-width: 0;
  }
  .num-input {
    width: 72px;
    flex: none;
  }

  input,
  select {
    font-size: 12px;
    padding: 5px 7px;
    color: var(--color-fg);
    background: var(--color-card-2);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-xs);
  }

  .foot {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    padding-top: var(--space-4);
    border-top: var(--hairline) solid var(--color-border-soft);
  }

  .ok {
    color: var(--color-pos);
  }
  .err {
    margin-top: var(--space-2);
    color: var(--color-neg);
    overflow-wrap: anywhere;
  }
</style>
