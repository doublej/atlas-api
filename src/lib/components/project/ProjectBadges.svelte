<script lang="ts">
import { frameworkColor, typeColor } from '$lib/browser/colors'
import Icon from '$lib/components/icons/Icon.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import type { GitStatus, Project } from '$lib/scanner'
import { getHostById } from '$shared/hosts'

interface Props {
  project: Project
  git?: { status: GitStatus; branch?: string }
  /** Set once the catalog holds more than one machine — an unlabelled row next to a
      labelled twin reads as broken rather than as "this one is here". */
  showHost?: boolean
  /** Current version per template name, for flagging a project behind its scaffold. */
  templateVersions?: Record<string, string>
}

const { project, git, showHost = false, templateVersions }: Props = $props()

const hostLabel = (id: string): string => getHostById(id)?.label ?? id
const twins = $derived(project.alsoOn ?? [])

const promotionTone = {
  published: 'pos',
  ready: 'info',
  'in-progress': 'warn',
  draft: 'neutral',
  none: 'neutral',
} as const

const promotionStatus = $derived(project.promotion?.status)
const currentTemplateVersion = $derived(
  project.template ? templateVersions?.[project.template.name] : undefined,
)
const scaffoldBehind = $derived(
  currentTemplateVersion !== undefined && currentTemplateVersion !== project.template?.version,
)
</script>

{#if showHost && project.host}
  <Badge tone={project.isLocal ? 'neutral' : 'warn'} title={project.isLocal ? 'On this machine' : `On ${hostLabel(project.host)}: ${project.path}`}>
    {hostLabel(project.host)}
  </Badge>
{/if}

{#each twins as twin (twin.host)}
  <Badge tone="info" title="Same project on {hostLabel(twin.host)}: {twin.path}">
    also on {hostLabel(twin.host)}
  </Badge>
{/each}

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
  <Badge
    tone={promotionTone[promotionStatus] ?? 'neutral'}
    title="Social promo plan in _management/promotion-vault: {promotionStatus}"
  >
    promo {promotionStatus}
  </Badge>
{/if}

{#if git?.branch}
  <span class="branch t-caption" title="Current branch">
    <Icon name="gitBranch" size={11} />
    {git.branch}
  </span>
{/if}

{#if project.template}
  {@const shortName = project.template.name.split('/').pop() ?? project.template.name}
  <a
    class="template-link"
    href="/templates?t={encodeURIComponent(project.template.name)}"
    title={scaffoldBehind
      ? `Scaffold: ${project.template.name} v${project.template.version}, template is at v${currentTemplateVersion}; run /update-scaffold`
      : `Scaffold: ${project.template.name} v${project.template.version}`}
  >
    {#if scaffoldBehind}
      <Badge tone="warn">{shortName} v{project.template.version} → {currentTemplateVersion}</Badge>
    {:else}
      <Badge tone="accent">{shortName} v{project.template.version}</Badge>
    {/if}
  </a>
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

  .template-link {
    text-decoration: none;
  }
</style>
