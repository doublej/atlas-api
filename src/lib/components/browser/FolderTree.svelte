<script lang="ts">
import type { Snippet } from 'svelte'
import { countProjects, type FolderNode } from '$lib/browser/tree'
import Icon from '$lib/components/icons/Icon.svelte'
import type { Project } from '$lib/scanner'
import FolderTree from './FolderTree.svelte'

interface Props {
  node: FolderNode
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  row: Snippet<[Project]>
}

const { node, depth, expanded, onToggle, row }: Props = $props()

const children = $derived([...node.children.entries()].sort((a, b) => a[0].localeCompare(b[0])))
</script>

{#each children as [name, child] (child.path)}
  {@const isOpen = expanded.has(child.path)}
  <div class="folder" style:--depth={depth}>
    <button
      class="toggle"
      type="button"
      aria-expanded={isOpen}
      onclick={() => onToggle(child.path)}
    >
      <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} />
      <Icon name={isOpen ? 'folderOpen' : 'folder'} size={13} />
      <span class="name">{name}</span>
      <span class="count num">{countProjects(child)}</span>
    </button>

    {#if isOpen}
      {#if child.projects.length > 0}
        <ul class="rows">
          {#each child.projects as project (project.path)}
            {@render row(project)}
          {/each}
        </ul>
      {/if}
      <FolderTree node={child} depth={depth + 1} {expanded} {onToggle} {row} />
    {/if}
  </div>
{/each}

<style>
  .folder {
    padding-left: calc(var(--depth) * var(--space-4));
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--row-px);
    font-family: inherit;
    font-size: 13px;
    color: var(--color-fg-2);
    background: none;
    border: none;
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-out);
  }

  .toggle:hover {
    background: var(--color-card-2);
    color: var(--color-fg);
  }

  .name {
    font-weight: 500;
  }

  .count {
    margin-left: auto;
    font-size: 11px;
    color: var(--color-muted-2);
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
