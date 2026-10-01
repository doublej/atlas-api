<script lang="ts">
import type { AtlasConfig } from '$lib/atlasFile'
import { http } from '$lib/http'
import type { Project } from '$lib/scanner'
import { applyScanOverrides, type Detection } from './scan-overrides'

/** The two knobs that live in `.atlas-config.json` rather than in the project's own `.atlas`. */
const { project }: { project: Project } = $props()

let config = $state<AtlasConfig | null>(null)
let force = $state<Detection>('auto')
let depth = $state('')

$effect(() => {
  const rel = project.relativePath
  http.get<AtlasConfig>('/api/config').then((scan) => {
    config = scan
    force = String(scan.force?.[rel] ?? 'auto') as typeof force
    depth = scan.depth?.[rel] == null ? '' : String(scan.depth[rel])
  })
})

/** Writes the config when this form changed it; the dialog calls it on Save. */
export async function save(): Promise<void> {
  if (!config) return
  const next = applyScanOverrides(config, project.relativePath, force, depth)
  const unchanged =
    JSON.stringify(next.depth) === JSON.stringify(config.depth) &&
    JSON.stringify(next.force) === JSON.stringify(config.force)
  if (unchanged) return

  await http.put('/api/config', next)
  config = next
}
</script>

<p class="t-caption muted">
  Scanner overrides for this path. <strong>Depth</strong> is the walk limit for this subtree —
  and the only way to catalog a project that sits inside this one.
  <strong>Detection</strong> promotes or demotes a folder the scanner read wrong.
</p>

<div class="grid">
  <label class="field">
    <span class="t-caption">Detection</span>
    <select bind:value={force}>
      <option value="auto">Automatic</option>
      <option value="true">Always a project</option>
      <option value="false">Never a project</option>
    </select>
  </label>

  <label class="field">
    <span class="t-caption">Scan depth</span>
    <input
      bind:value={depth}
      inputmode="numeric"
      placeholder={config ? `inherits ${config.maxDepth}` : 'inherits'}
    />
  </label>
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

  @media (max-width: 560px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
