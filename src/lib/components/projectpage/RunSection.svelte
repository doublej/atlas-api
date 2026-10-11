<script lang="ts">
import HostnameChip from '$lib/components/dialogs/hostname/HostnameChip.svelte'
import Icon from '$lib/components/icons/Icon.svelte'
import Button from '$lib/components/ui/Button.svelte'
import type { Project } from '$lib/scanner'
import ProcessTable from './parts/ProcessTable.svelte'
import Section from './parts/Section.svelte'
import type { ProjectProcesses } from './processes.svelte'

interface Props {
  project: Project
  processes: ProjectProcesses
  /** The URL the last run answered with, if this page started one. */
  runningUrl?: string
  onRunDev: (project: Project) => void
  onRunScript: (project: Project, script: string) => void
  onRunJust: (project: Project, recipe: string) => void
  onstop: () => void
}

const { project, processes, runningUrl, onRunDev, onRunScript, onRunJust, onstop }: Props = $props()

const scripts = $derived(Object.entries(project.scripts ?? {}))
// Deduped: the scanner's recipe regex also reads `set x := …` lines, once per setting.
const recipes = $derived([...new Set(project.justRecipes ?? [])])
/** A remote project shows what it has; running anything is this Mac's business only. */
const local = $derived(project.isLocal === true)
</script>

<Section id="run" title="Run">
  {#snippet actions()}
    {#if local && project.devCommand}
      <Button variant="primary" onclick={() => onRunDev(project)} title={project.devCommand}>
        <Icon name="play" size={12} /> Run dev
      </Button>
    {/if}
    {#if processes.running}<Button variant="danger" onclick={onstop}>Stop</Button>{/if}
  {/snippet}

  <dl class="facts">
    <dt>Dev command</dt>
    <dd class="mono">{project.devCommand ?? '—'}</dd>

    <dt>Port</dt>
    <dd>
      <span class="num">{project.port ?? '—'}</span>
      {#if !project.port}<span class="muted-2">allocated on the first run</span>{/if}
    </dd>

    {#if local}
      <dt>Dev hostname</dt>
      <dd>
        <HostnameChip path={project.path} />
        <a href="#settings">Assign or change it in Settings</a>
      </dd>
    {/if}

    {#if runningUrl}
      <dt>Started</dt>
      <dd><a href={runningUrl} target="_blank" rel="noreferrer">{runningUrl}</a></dd>
    {/if}
  </dl>

  {#if scripts.length}
    <h3>Scripts <span class="muted-2">({project.runner ?? 'npm'} run)</span></h3>
    <dl class="facts">
      {#each scripts as [name, command] (name)}
        <dt class="mono">{name}</dt>
        <dd>
          {#if local}
            <Button onclick={() => onRunScript(project, name)}><Icon name="play" size={10} /> Run</Button>
          {/if}
          <code class="cmd">{command}</code>
        </dd>
      {/each}
    </dl>
  {/if}

  {#if recipes.length}
    <h3>Just recipes</h3>
    <div class="recipes">
      {#each recipes as recipe (recipe)}
        <Button disabled={!local} onclick={() => onRunJust(project, recipe)}>
          <Icon name="play" size={10} />
          {recipe}
        </Button>
      {/each}
    </div>
  {/if}

  {#if local}
    <h3>Running now</h3>
    <ProcessTable {processes} />
  {/if}
</Section>

<style>
  .cmd {
    font-size: 12px;
    color: var(--color-muted);
  }

  .recipes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
</style>
