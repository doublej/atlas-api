<script lang="ts">
import type { Snippet } from 'svelte'
import { frameworkColor, typeColor } from '$lib/browser/colors'
import Icon from '$lib/components/icons/Icon.svelte'
import type { ProjectSummary } from '$lib/project-summary'
import type { GitStatus } from '$lib/scanner'
import type { Column, RowState } from '$lib/table'
import { TableSort } from '$lib/table-sort.svelte'
import { getDynamicActions } from '$shared/actions'
import { getHostById } from '$shared/hosts'
import Table from './Table.svelte'

interface Props {
  projects: ProjectSummary[]
  gitStatus: Record<string, { status: GitStatus; branch?: string }>
  hostnames: Record<string, { local: string; remote: string }>
  runningPorts: Record<string, string>
  showHost: boolean
  onRunDev: (project: ProjectSummary) => void
  /** The full row (badges, details, actions) shown when a line is opened. */
  detail: Snippet<[ProjectSummary]>
}

const { projects, gitStatus, hostnames, runningPorts, showHost, onRunDev, detail }: Props = $props()

type P = ProjectSummary

// Order git by how much attention a repo needs: dirty first when descending.
const GIT_RANK: Record<string, number> = { dirty: 3, error: 2, clean: 1, 'no-repo': 0 }
const stack = (p: P) => (p.framework && p.framework !== 'unknown' ? p.framework : (p.type ?? ''))
const swatch = (p: P) =>
  p.framework && p.framework !== 'unknown' ? frameworkColor(p.framework) : typeColor(p.type ?? '')

/** Counts, dates and "needs attention" open high-to-low; text columns open A→Z. */
const sort = new TableSort<string>('modified', ['git', 'links', 'claude', 'modified', 'run'])

const columns = $derived<Column<P>[]>([
  {
    key: 'git',
    label: 'Git status',
    hideLabel: true,
    sort: (p) => GIT_RANK[gitStatus[p.path]?.status ?? ''] ?? -1,
    cell: gitCell,
  },
  { key: 'name', label: 'Name', sort: (p) => p.name.toLowerCase(), fill: true, cell: nameCell },
  { key: 'path', label: 'Path', sort: (p) => p.relativePath, hideBelow: 768, cell: pathCell },
  {
    key: 'stack',
    label: 'Stack',
    sort: stack,
    hideBelow: 768,
    cell: stackCell,
  },
  {
    key: 'branch',
    label: 'Branch',
    sort: (p) => gitStatus[p.path]?.branch ?? '',
    hideBelow: 1100,
    cell: branchCell,
  },
  ...(showHost
    ? [{ key: 'host', label: 'Host', sort: (p: P) => p.host, cell: hostCell } satisfies Column<P>]
    : []),
  {
    key: 'links',
    label: 'Links',
    sort: (p) =>
      Number(Boolean(runningPorts[p.path] || hostnames[p.slug])) + (p.domains?.length ?? 0),
    hideBelow: 768,
    cell: linksCell,
  },
  {
    key: 'claude',
    label: 'CLAUDE.md',
    sort: (p) => p.agentFiles?.claude?.tokens ?? 0,
    align: 'right',
    hideBelow: 1100,
    cell: claudeCell,
  },
  { key: 'modified', label: 'Modified', sort: (p) => p.modifiedAt, align: 'right', cell: ageCell },
  {
    key: 'run',
    label: 'Runnable',
    hideLabel: true,
    sort: (p) => Number(Boolean(p.isLocal && p.devCommand)),
    cell: runCell,
  },
])

const DAY = 86_400_000
/** Compact age for a narrow column: `today`, `12d`, `5mo`, `3y`. The tooltip carries the date. */
function age(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY)
  if (days < 1) return 'today'
  if (days < 60) return `${days}d`
  if (days < 730) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

const tokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
</script>

{#snippet gitCell(p: P)}
  <!-- A remote project without git state was scanned without git (Fractal); it is not loading. -->
  {@const status = gitStatus[p.path]?.status ?? (p.isLocal ? 'loading' : 'not scanned')}
  <span class="git" data-status={status} title="git: {status}"></span>
{/snippet}

{#snippet nameCell(p: P, row: RowState)}
  <button type="button" class="name" aria-expanded={row.open} onclick={row.toggleOpen}>{p.name}</button>
  {#if p.description}<span class="desc">{p.description}</span>{/if}
{/snippet}

{#snippet pathCell(p: P)}<span class="path mono" title={p.path}>{p.relativePath}</span>{/snippet}

{#snippet stackCell(p: P)}
  {#if stack(p)}
    <span class="swatch" style:background={swatch(p)}></span>{stack(p)}
    {#if p.runner}<span class="muted">{p.runner}</span>{/if}
  {/if}
{/snippet}

{#snippet branchCell(p: P)}
  {@const branch = gitStatus[p.path]?.branch ?? ''}
  <span class="clip mono muted" title={branch}>{branch}</span>
{/snippet}

{#snippet hostCell(p: P)}<span class:remote={!p.isLocal}>{getHostById(p.host)?.label ?? p.host}</span>{/snippet}

{#snippet linksCell(p: P)}
  {@const url = runningPorts[p.path]}
  {@const hostname = hostnames[p.slug]}
  <span class="links">
    {#if url}
      <a class="live" href={url} target="_blank" rel="noreferrer" title={url}>live</a>
    {:else if hostname}
      <a href={hostname.local} target="_blank" rel="noreferrer" title={hostname.local} aria-label="Dev hostname">
        <Icon name="link" size={12} />
      </a>
    {/if}
    {#each getDynamicActions('domain-open', p) as link (link.value)}
      <a href={link.value} target="_blank" rel="noreferrer" title={link.name} aria-label={link.name}>
        <Icon name="globe" size={12} />
      </a>
    {/each}
  </span>
{/snippet}

{#snippet claudeCell(p: P)}
  <span class="num muted">{p.agentFiles?.claude ? tokens(p.agentFiles.claude.tokens) : ''}</span>
{/snippet}

{#snippet ageCell(p: P)}
  <time class="num muted" datetime={p.modifiedAt} title={new Date(p.modifiedAt).toLocaleString()}>{age(p.modifiedAt)}</time>
{/snippet}

{#snippet runCell(p: P)}
  {#if p.isLocal && p.devCommand}
    <button type="button" class="run" title="Run {p.devCommand}" aria-label="Run {p.name}" onclick={() => onRunDev(p)}>
      <Icon name="play" size={11} />
    </button>
  {/if}
{/snippet}

{#snippet opened(p: P)}
  <ul class="detail">{@render detail(p)}</ul>
{/snippet}

<!-- The first 80 rows (~3 screens) are server-rendered and hydrate in place; the other 500+
     follow right after mount. All of them in the HTML made "/" 1.45MB. -->
<Table label="Projects" rows={projects} key={(p) => p.path} {columns} {sort} expanded={opened} initialRows={80} />

<style>
  .git {
    display: block;
    width: 6px;
    height: 6px;
    margin-top: 6px;
    border-radius: var(--radius-full);
    background: var(--color-disabled);
  }

  .git[data-status='clean'] {
    background: var(--status-clean);
  }
  .git[data-status='dirty'] {
    background: var(--status-dirty);
  }
  .git[data-status='error'] {
    background: var(--status-error);
  }
  .git[data-status='no-repo'] {
    background: var(--status-idle);
  }

  .name {
    padding: 0;
    font: inherit;
    font-weight: 500;
    color: var(--color-fg);
    background: none;
    border: none;
    cursor: pointer;
  }

  .desc {
    margin-left: var(--space-2);
    color: var(--color-muted-2);
  }

  /* A block, so the cell can cap it: a deep path or a long branch ellipsizes instead of
     widening the table. */
  .path,
  .clip {
    display: block;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .path {
    color: var(--color-muted);
  }

  .clip {
    max-width: 140px;
  }

  .mono {
    font-family: var(--font-mono);
    font-size: 11px;
  }

  .muted {
    color: var(--color-muted-2);
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .swatch {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-right: 5px;
    border-radius: 2px;
    vertical-align: 1px;
  }

  .swatch ~ .muted {
    margin-left: var(--space-1);
  }

  .remote {
    color: var(--color-warn);
  }

  .links {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .links a {
    display: inline-flex;
    color: var(--color-muted);
  }

  .links a:hover {
    color: var(--color-accent);
  }

  .links .live {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-pos);
  }

  .run {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 20px;
    margin: -1px 0;
    color: var(--color-muted);
    background: none;
    border: var(--hairline) solid transparent;
    border-radius: var(--radius-xs);
    cursor: pointer;
    opacity: 0;
  }

  :global(tr:hover) .run,
  .run:focus-visible {
    opacity: 1;
    border-color: var(--color-border);
  }

  .run:hover {
    color: var(--color-accent);
  }

  .detail {
    margin: 0;
    padding: 0 0 0 var(--space-4);
    list-style: none;
  }

  @media (max-width: 768px) {
    .desc {
      display: none;
    }
  }

  /* No hover on touch: the run button is always there. */
  @media (hover: none) {
    .run {
      opacity: 1;
    }
  }
</style>
