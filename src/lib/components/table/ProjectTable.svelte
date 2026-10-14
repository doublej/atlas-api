<script lang="ts" module>
import { TableSort } from '$lib/table-sort.svelte'

const DEFAULT_SORT = 'modified'
/** Counts, dates and "needs attention" open high-to-low; text columns open A→Z. */
const DESC_FIRST = ['git', 'links', 'claude', 'modified', 'run']

/** `?sort=name`, `?sort=-modified` (descending) → the table's sort. */
export function sortFromParam(param: string | null): TableSort<string> {
  const sort = new TableSort<string>(DEFAULT_SORT, DESC_FIRST)
  if (param) {
    sort.key = param.replace(/^-/, '')
    sort.descending = param.startsWith('-')
  }
  return sort
}

/** `null` for the default order, so a plain view keeps a clean URL. */
export function sortToParam(sort: TableSort<string>): string | null {
  const value = `${sort.descending ? '-' : ''}${sort.key}`
  return sort.key === null || value === `-${DEFAULT_SORT}` ? null : value
}
</script>

<script lang="ts">
import type { Snippet } from 'svelte'
import { goto } from '$app/navigation'
import { frameworkColor, typeColor } from '$lib/browser/colors'
import Icon from '$lib/components/icons/Icon.svelte'
import { type ProjectSummary, projectHref } from '$lib/project-summary'
import type { GitStatus } from '$lib/scanner'
import type { Selection } from '$lib/selection.svelte'
import type { Column } from '$lib/table'
import { getDynamicActions } from '$shared/actions'
import { getHostById } from '$shared/hosts'
import NameCell, { folderOf } from './NameCell.svelte'
import Table from './Table.svelte'
import TagsCell from './TagsCell.svelte'

interface Props {
  projects: ProjectSummary[]
  gitStatus: Record<string, { status: GitStatus; branch?: string }>
  hostnames: Record<string, { local: string; remote: string }>
  runningPorts: Record<string, string>
  showHost: boolean
  onRunDev: (project: ProjectSummary) => void
  /** The full row (badges, details, actions) shown when a line is opened. */
  detail: Snippet<[ProjectSummary]>
  /** Owned by the page, which keeps it in the URL (`sortFromParam`). */
  sort: TableSort<string>
  /** Local projects only: the bulk bar writes to what is selected. */
  selection: Selection<string>
  /** The tag filter, so a tag chip reads pressed while it filters. */
  activeTags: Set<string>
  onTag: (tag: string) => void
}

const {
  projects,
  gitStatus,
  hostnames,
  runningPorts,
  showHost,
  onRunDev,
  detail,
  sort,
  selection,
  activeTags,
  onTag,
}: Props = $props()

type P = ProjectSummary

// Order git by how much attention a repo needs: dirty first when descending.
const GIT_RANK: Record<string, number> = { dirty: 3, error: 2, clean: 1, 'no-repo': 0 }
const stack = (p: P) => (p.framework && p.framework !== 'unknown' ? p.framework : (p.type ?? ''))
const swatch = (p: P) =>
  p.framework && p.framework !== 'unknown' ? frameworkColor(p.framework) : typeColor(p.type ?? '')

// Name is the one column without a width: it takes what is left. Each other column hides at the
// table width where showing it would leave Name under ~300px — stack, then links, tags, path,
// branch and the CLAUDE.md size, in that order. Below the Folder tier the name carries its folder.
const columns = $derived<Column<P>[]>([
  {
    key: 'git',
    width: '2.25rem',
    label: 'Git status',
    hideLabel: true,
    sort: (p) => GIT_RANK[gitStatus[p.path]?.status ?? ''] ?? -1,
    cell: gitCell,
  },
  { key: 'name', label: 'Name', sort: (p) => p.name.toLowerCase(), cell: nameCell },
  {
    key: 'path',
    width: '15rem',
    label: 'Folder',
    sort: (p) => p.relativePath,
    hideBelow: 1280,
    cell: pathCell,
  },
  { key: 'tags', width: '13rem', label: 'Tags', hideBelow: 1100, cell: tagsCell },
  {
    key: 'stack',
    width: '10rem',
    label: 'Stack',
    sort: stack,
    hideBelow: 768,
    cell: stackCell,
  },
  {
    key: 'branch',
    width: '10rem',
    label: 'Branch',
    sort: (p) => gitStatus[p.path]?.branch ?? '',
    hideBelow: 1440,
    cell: branchCell,
  },
  ...(showHost
    ? [
        {
          key: 'host',
          width: '4.5rem',
          label: 'Host',
          sort: (p: P) => p.host,
          cell: hostCell,
        } satisfies Column<P>,
      ]
    : []),
  {
    key: 'links',
    width: '5.5rem',
    label: 'Links',
    sort: (p) =>
      Number(Boolean(runningPorts[p.path] || hostnames[p.slug])) + (p.domains?.length ?? 0),
    hideBelow: 960,
    cell: linksCell,
  },
  {
    key: 'claude',
    width: '6.5rem',
    label: 'CLAUDE.md',
    sort: (p) => p.agentFiles?.claude?.tokens ?? 0,
    align: 'right',
    hideBelow: 1600,
    cell: claudeCell,
  },
  {
    key: 'modified',
    width: '5.5rem',
    label: 'Modified',
    sort: (p) => p.modifiedAt,
    align: 'right',
    cell: ageCell,
  },
  {
    key: 'run',
    width: '3.25rem',
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

{#snippet nameCell(p: P)}<NameCell project={p} />{/snippet}

{#snippet tagsCell(p: P)}<TagsCell tags={p.tags ?? []} active={activeTags} ontag={onTag} />{/snippet}

{#snippet pathCell(p: P)}<span class="path mono" title={p.path}>{folderOf(p.relativePath)}</span>{/snippet}

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
<Table
  label="Projects"
  rows={projects}
  key={(p) => p.path}
  {columns}
  {sort}
  {selection}
  rowLabel={(p) => p.name}
  canSelect={(p) => Boolean(p.isLocal)}
  dim={(p) => Boolean(p.archived)}
  clickOpens
  onopen={(p) => goto(projectHref(p))}
  expanded={opened}
  initialRows={80}
/>

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

  /* A block, so a deep path or a long branch ellipsizes inside its column. */
  .path,
  .clip {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .path {
    color: var(--color-muted);
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

  /* No hover on touch: the run button is always there. */
  @media (hover: none) {
    .run {
      opacity: 1;
    }
  }
</style>
