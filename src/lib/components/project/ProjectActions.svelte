<script lang="ts">
import { isRunnable } from '$lib/browser/api'
import Icon from '$lib/components/icons/Icon.svelte'
import Button from '$lib/components/ui/Button.svelte'
import Menu from '$lib/components/ui/Menu.svelte'
import type { Project } from '$lib/scanner'
import { type ActionDef, getActions, getDynamicActions, getGroupsForActions } from '$shared/actions'

interface Props {
  project: Project
  onRunDev: (project: Project) => void
  onRunScript: (project: Project, script: string) => void
  onRunJust: (project: Project, recipe: string) => void
  onIterm: (path: string) => void
  onFinder: (path: string) => void
  onRename: (project: Project) => void
  onMove: (project: Project) => void
  /** Everything the registry offers that isn't one of the inline buttons above. */
  onAction: (action: ActionDef, project: Project) => void
}

const {
  project,
  onRunDev,
  onRunScript,
  onRunJust,
  onIterm,
  onFinder,
  onRename,
  onMove,
  onAction,
}: Props = $props()

// The six actions with a button of their own; everything else the project qualifies for
// lands in the overflow menu, grouped the way the registry groups it.
const INLINE = new Set(['run-dev', 'open-iterm', 'open-finder', 'claude-tree-view'])

const actions = $derived(getActions(project, 'svelte'))
const has = (id: string): boolean => actions.some((a) => a.id === id)
const labelFor = (id: string): string => actions.find((a) => a.id === id)?.label ?? id

const scripts = $derived(getDynamicActions('run-script', project))
const recipes = $derived(getDynamicActions('run-just', project))
const overflow = $derived(actions.filter((a) => !INLINE.has(a.id) && isRunnable(a)))
const dialogs = $derived(
  actions.filter((a) => ['rename', 'move', 'project-settings', 'beads-create'].includes(a.id)),
)
const menuActions = $derived([...dialogs, ...overflow])
const groups = $derived(getGroupsForActions(menuActions))
</script>

<div class="actions">
  {#if has('run-dev')}
    <Button variant="primary" onclick={() => onRunDev(project)} title={project.devCommand}>
      <Icon name="play" size={12} />
      Run
    </Button>
  {/if}

  {#if scripts.length > 0}
    <Menu label="Run a script" align="end">
      {#snippet trigger()}
        {project.runner ?? 'npm'}
        <span class="num count">{scripts.length}</span>
      {/snippet}
      {#snippet children(close)}
        {#each scripts as script (script.name)}
          <button
            class="item"
            type="button"
            role="menuitem"
            onclick={() => {
              onRunScript(project, script.name)
              close()
            }}
          >
            {script.name}
          </button>
        {/each}
      {/snippet}
    </Menu>
  {/if}

  {#if recipes.length > 0}
    <Menu label="Run a just recipe" align="end">
      {#snippet trigger()}
        just
        <span class="num count">{recipes.length}</span>
      {/snippet}
      {#snippet children(close)}
        {#each recipes as recipe (recipe.name)}
          <button
            class="item"
            type="button"
            role="menuitem"
            onclick={() => {
              onRunJust(project, recipe.name)
              close()
            }}
          >
            {recipe.name}
          </button>
        {/each}
      {/snippet}
    </Menu>
  {/if}

  {#if has('open-iterm')}
    <Button onclick={() => onIterm(project.path)} title={labelFor('open-iterm')}>
      <Icon name="terminal" size={12} />
    </Button>
  {/if}

  {#if has('open-finder')}
    <Button onclick={() => onFinder(project.path)} title={labelFor('open-finder')}>
      <Icon name="folder" size={12} />
    </Button>
  {/if}

  {#if has('claude-tree-view')}
    <Button
      title={labelFor('claude-tree-view')}
      onclick={() =>
        window.open(`/claude-tree?root=${encodeURIComponent(project.path)}`, '_blank')}
    >
      <Icon name="tree" size={12} />
    </Button>
  {/if}

  {#if menuActions.length > 0}
    <Menu label="More actions" align="end">
      {#snippet trigger()}
        <Icon name="ellipsis" size={14} />
      {/snippet}
      {#snippet children(close)}
        {#each groups as group (group.id)}
          {@const items = menuActions.filter((a) => a.group === group.id)}
          {#if items.length > 0}
            <p class="group t-caption">{group.label}</p>
            {#each items as action (action.id)}
              <button
                class="item"
                type="button"
                role="menuitem"
                onclick={() => {
                  if (action.id === 'rename') onRename(project)
                  else if (action.id === 'move') onMove(project)
                  else onAction(action, project)
                  close()
                }}
              >
                {action.label}
              </button>
            {/each}
          {/if}
        {/each}
      {/snippet}
    </Menu>
  {/if}
</div>

<style>
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .count {
    font-size: 10px;
    color: var(--color-muted-2);
  }

  .item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 6px var(--space-2);
    font-family: inherit;
    font-size: 12px;
    text-align: left;
    color: var(--color-fg-2);
    background: none;
    border: none;
    border-radius: var(--radius-xs);
    cursor: pointer;
  }

  .item:hover {
    background: var(--color-hover);
    color: var(--color-fg);
  }

  .group {
    margin: var(--space-2) 0 2px;
    padding: 0 var(--space-2);
    color: var(--color-muted-2);
  }

  .group:first-child {
    margin-top: 0;
  }
</style>
