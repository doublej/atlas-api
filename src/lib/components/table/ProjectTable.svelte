<script lang="ts">
import type { Snippet } from 'svelte'
import Icon from '$lib/components/icons/Icon.svelte'
import type { GitStatus, Project } from '$lib/scanner'
import ProjectLine from './ProjectLine.svelte'

interface Props {
  projects: Project[]
  gitStatus: Record<string, { status: GitStatus; branch?: string }>
  hostnames: Record<string, { local: string; remote: string }>
  runningPorts: Record<string, string>
  showHost: boolean
  onRunDev: (project: Project) => void
  /** The full row (badges, details, actions) shown when a line is opened. */
  detail: Snippet<[Project]>
}

const { projects, gitStatus, hostnames, runningPorts, showHost, onRunDev, detail }: Props = $props()

type SortKey = 'name' | 'path' | 'stack' | 'modified'
let sortKey = $state<SortKey>('modified')
let descending = $state(true)
let open = $state<string | null>(null)

const keyOf: Record<SortKey, (p: Project) => string> = {
  name: (p) => p.name.toLowerCase(),
  path: (p) => p.relativePath,
  stack: (p) => (p.framework && p.framework !== 'unknown' ? p.framework : (p.type ?? '')),
  modified: (p) => p.modifiedAt,
}

const sorted = $derived(
  [...projects].sort((a, b) => {
    const order = keyOf[sortKey](a).localeCompare(keyOf[sortKey](b))
    return descending ? -order : order
  }),
)

// Newest-first is the only column worth opening descending; text columns start A→Z.
function sortBy(key: SortKey): void {
  descending = sortKey === key ? !descending : key === 'modified'
  sortKey = key
}

const columns = $derived(showHost ? 10 : 9)
</script>

{#snippet header(key: SortKey, label: string, cls = '')}
  <th class={cls} aria-sort={sortKey === key ? (descending ? 'descending' : 'ascending') : 'none'}>
    <button type="button" onclick={() => sortBy(key)}>
      {label}
      {#if sortKey === key}<Icon name="chevronDown" size={10} />{/if}
    </button>
  </th>
{/snippet}

<table>
  <thead>
    <tr>
      <th class="dot-col"><span class="sr-only">Git status</span></th>
      {@render header('name', 'Name')}
      {@render header('path', 'Path', 'path')}
      {@render header('stack', 'Stack')}
      <th class="opt">Branch</th>
      {#if showHost}<th>Host</th>{/if}
      <th>Links</th>
      <th class="opt num">CLAUDE.md</th>
      {@render header('modified', 'Modified', 'num')}
      <th><span class="sr-only">Run</span></th>
    </tr>
  </thead>
  <tbody>
    {#each sorted as p (p.path)}
      <ProjectLine
        project={p}
        git={gitStatus[p.path]}
        hostname={hostnames[p.slug]}
        runningUrl={runningPorts[p.path]}
        {showHost}
        open={open === p.path}
        onToggle={() => (open = open === p.path ? null : p.path)}
        {onRunDev}
      />
      {#if open === p.path}
        <tr>
          <td class="detail" colspan={columns}>
            <ul>{@render detail(p)}</ul>
          </td>
        </tr>
      {/if}
    {/each}
  </tbody>
</table>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }

  th {
    padding: 8px var(--space-2) 6px;
    font-size: 11px;
    font-weight: 500;
    text-align: left;
    white-space: nowrap;
    color: var(--color-muted-2);
    border-bottom: var(--hairline) solid var(--color-border);
  }

  th.num {
    text-align: right;
  }

  .dot-col {
    width: 14px;
  }

  th button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
  }

  th button:hover,
  th[aria-sort='ascending'],
  th[aria-sort='descending'] {
    color: var(--color-fg);
  }

  th[aria-sort='ascending'] :global(svg) {
    transform: rotate(180deg);
  }

  .detail {
    padding: 0 0 0 var(--space-4);
    background: var(--color-card-2);
    border-bottom: var(--hairline) solid var(--color-border);
  }

  .detail ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  @media (max-width: 1100px) {
    .opt {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .path {
      display: none;
    }
  }
</style>
