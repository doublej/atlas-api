<script lang="ts">
import type { Snippet } from 'svelte'
import type { FolderNode } from '$lib/browser/tree'
import PageState from '$lib/components/feedback/PageState.svelte'
import ProjectTable from '$lib/components/table/ProjectTable.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Card from '$lib/components/ui/Card.svelte'
import { errorMessage } from '$lib/format'
import type { ProjectRecords } from '$lib/project-records.svelte'
import type { ProjectSummary } from '$lib/project-summary'
import type { GitStatus, Project } from '$lib/scanner'
import FolderTree from './FolderTree.svelte'

interface Props {
  /** The filtered list. */
  projects: ProjectSummary[]
  /** How many the catalog holds before filtering: tells "nothing matches" from "nothing yet". */
  total: number
  viewMode: 'table' | 'flat' | 'nested'
  records: ProjectRecords
  /** The catalog itself could not be read. */
  error: string | null
  onretry: () => void
  onClearFilters: () => void
  /** The Nested view's folders, built from the same filtered list. */
  tree: FolderNode
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  gitStatus: Record<string, { status: GitStatus; branch?: string }>
  hostnames: Record<string, { local: string; remote: string }>
  runningPorts: Record<string, string>
  showHost: boolean
  onRunDev: (project: ProjectSummary) => void
  /** The full row for one complete record. */
  item: Snippet<[Project]>
}

const {
  projects,
  total,
  viewMode,
  records,
  error,
  onretry,
  onClearFilters,
  tree,
  expandedFolders,
  onToggleFolder,
  item,
  ...table
}: Props = $props()

$effect(() => {
  if (viewMode !== 'table' && !records.all && !records.error) records.loadAll()
})
</script>

{#snippet detail(p: ProjectSummary)}
  {#await records.get(p.path)}
    <PageState loading loadingText="Loading {p.name}…" />
  {:then project}
    {@render item(project)}
  {:catch e}
    <PageState error={errorMessage(e)} empty />
  {/await}
{/snippet}

<!-- Cards/Nested render only once `records.all` is in (see `loading` below). -->
{#snippet fullItem(p: ProjectSummary)}
  {@render item(records.all?.get(p.path) ?? p)}
{/snippet}

{#snippet clearAction()}
  <Button variant="primary" onclick={onClearFilters}>Clear filters</Button>
{/snippet}

<PageState
  error={error ?? (viewMode === 'table' ? null : records.error)}
  onretry={error ? onretry : () => records.loadAll()}
  loading={viewMode !== 'table' && !records.all && !records.error}
  loadingText="Loading project details…"
  empty={projects.length === 0}
  emptyText={total ? 'No project matches the current search and filters.' : 'No projects catalogued yet.'}
  emptyAction={total ? clearAction : undefined}
>
  {#if viewMode === 'table'}
    <Card flush>
      <ProjectTable {projects} {...table} {detail} />
    </Card>
  {:else if viewMode === 'nested'}
    <Card flush>
      {#if tree.projects.length > 0}
        <ul class="rows">
          {#each tree.projects as project (project.path)}
            {@render fullItem(project)}
          {/each}
        </ul>
      {/if}
      <FolderTree node={tree} depth={0} expanded={expandedFolders} onToggle={onToggleFolder} row={fullItem} />
    </Card>
  {:else}
    <Card flush>
      <ul class="rows">
        {#each projects as project (project.path)}
          {@render fullItem(project)}
        {/each}
      </ul>
    </Card>
  {/if}
</PageState>

<style>
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
