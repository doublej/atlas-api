<script lang="ts">
import type { Snippet } from 'svelte'
import Icon from '$lib/components/icons/Icon.svelte'
import type { GitStatus, Project } from '$lib/scanner'
import { type SortValue, TableSort } from '$lib/table-sort.svelte'
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

type SortKey =
  | 'git'
  | 'name'
  | 'path'
  | 'stack'
  | 'branch'
  | 'host'
  | 'links'
  | 'claude'
  | 'modified'
  | 'run'
let open = $state<string | null>(null)

// Order git by how much attention a repo needs: dirty first when descending.
const GIT_RANK: Record<string, number> = { dirty: 3, error: 2, clean: 1, 'no-repo': 0 }

const keyOf: Record<SortKey, (p: Project) => SortValue> = {
  git: (p) => GIT_RANK[gitStatus[p.path]?.status ?? ''] ?? -1,
  name: (p) => p.name.toLowerCase(),
  path: (p) => p.relativePath,
  stack: (p) => (p.framework && p.framework !== 'unknown' ? p.framework : (p.type ?? '')),
  branch: (p) => gitStatus[p.path]?.branch ?? '',
  host: (p) => p.host,
  links: (p) =>
    Number(Boolean(runningPorts[p.path] || hostnames[p.slug])) + (p.domains?.length ?? 0),
  claude: (p) => p.agentFiles?.claude?.tokens ?? 0,
  modified: (p) => p.modifiedAt,
  run: (p) => Number(Boolean(p.isLocal && p.devCommand)),
}

/** Counts, dates and "needs attention" open high-to-low; text columns open A→Z. */
const sort = new TableSort<SortKey>('modified', ['git', 'links', 'claude', 'modified', 'run'])
const sorted = $derived(sort.apply(projects, keyOf))

const columns = $derived(showHost ? 10 : 9)
</script>

{#snippet header(key: SortKey, label: string, cls = '', hidden = false)}
  <th class={cls} aria-sort={sort.key === key ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
    <button type="button" onclick={() => sort.by(key)} aria-label={hidden ? `Sort by ${label}` : undefined} title={hidden ? label : undefined}>
      {#if !hidden}{label}{:else}<span class="mark"></span>{/if}
      {#if sort.key === key}<Icon name="chevronDown" size={10} />{/if}
    </button>
  </th>
{/snippet}

<table>
  <thead>
    <tr>
      {@render header('git', 'Git status', 'dot-col', true)}
      {@render header('name', 'Name')}
      {@render header('path', 'Path', 'path')}
      {@render header('stack', 'Stack')}
      {@render header('branch', 'Branch', 'opt')}
      {#if showHost}{@render header('host', 'Host')}{/if}
      {@render header('links', 'Links')}
      {@render header('claude', 'CLAUDE.md', 'opt num')}
      {@render header('modified', 'Modified', 'num')}
      {@render header('run', 'Runnable', 'run-col', true)}
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

  /* Icon-only headers: a dot for git status, a play glyph's worth of space for run. */
  .mark {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--color-muted-2);
  }

  .run-col .mark {
    border-radius: 1px;
    clip-path: polygon(0 0, 100% 50%, 0 100%);
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
