<script lang="ts">
import { frameworkColor, typeColor } from '$lib/browser/colors'
import Icon from '$lib/components/icons/Icon.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import type { GitStatus, Project } from '$lib/scanner'

interface Props {
  project: Project
  git?: { status: GitStatus; branch?: string }
}

const { project, git }: Props = $props()

const promotionTone = {
  published: 'pos',
  ready: 'info',
  'in-progress': 'warn',
  draft: 'neutral',
  none: 'neutral',
} as const

const promotionStatus = $derived(project.promotion?.status)
</script>

{#if project.type}
  <Badge dot={typeColor(project.type)}>{project.type}</Badge>
{/if}

{#if project.framework && project.framework !== 'unknown'}
  <Badge dot={frameworkColor(project.framework)}>{project.framework}</Badge>
{/if}

{#if project.runner}
  <Badge>{project.runner}</Badge>
{/if}

{#if promotionStatus}
  <Badge tone={promotionTone[promotionStatus] ?? 'neutral'} title="Promotion: {promotionStatus}">
    {promotionStatus}
  </Badge>
{/if}

{#if git?.branch}
  <span class="branch t-caption" title="Current branch">
    <Icon name="gitBranch" size={11} />
    {git.branch}
  </span>
{/if}

<style>
  .branch {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-family: var(--font-mono);
    color: var(--color-muted-2);
    white-space: nowrap;
  }
</style>
