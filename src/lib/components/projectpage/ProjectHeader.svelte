<script lang="ts">
import type { ComponentProps } from 'svelte'
import { frameworkColor, typeColor } from '$lib/browser/colors'
import HostnameChip from '$lib/components/dialogs/hostname/HostnameChip.svelte'
import ProjectActions from '$lib/components/project/ProjectActions.svelte'
import TagInput from '$lib/components/tags/TagInput.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import { tildify } from '$lib/format'
import type { GitStatus, Project } from '$lib/scanner'
import { toast } from '$lib/toast.svelte'
import { getHostById } from '$shared/hosts'
import type { Twin } from './href'
import InlineText from './parts/InlineText.svelte'

type Link = { name: string; href: string } | undefined

interface Props {
  project: Project
  git: { status: GitStatus; branch?: string } | null
  twins: Twin[]
  prev: Link
  next: Link
  tags: string[]
  vocabulary: string[]
  running: boolean
  onrename: (name: string) => Promise<unknown>
  ondescription: (text: string) => Promise<unknown>
  ontags: (tags: string[]) => void
  onstop: () => void
  /** Everything ProjectActions needs besides the project. */
  actions: Omit<ComponentProps<typeof ProjectActions>, 'project'>
}

const {
  project,
  git,
  twins,
  prev,
  next,
  tags,
  vocabulary,
  running,
  onrename,
  ondescription,
  ontags,
  onstop,
  actions,
}: Props = $props()

const STATE_TONE = { active: 'pos', parked: 'warn', dormant: 'neutral', archived: 'neg' } as const
const state = $derived(
  (Object.keys(STATE_TONE) as (keyof typeof STATE_TONE)[]).find((s) => tags.includes(s)),
)
const hostLabel = (id: string): string => getHostById(id)?.label ?? id
const local = $derived(project.isLocal === true)
const parent = $derived(project.relativePath.split('/').slice(0, -1).join('/'))

async function copyPath(): Promise<void> {
  await navigator.clipboard.writeText(project.path)
  toast(`Copied ${tildify(project.path)}`)
}
</script>

<header class="band">
  <nav class="crumbs t-caption" aria-label="Project navigation">
    <a href="/">Projects</a>
    {#if parent}<span class="muted-2">/ {parent}</span>{/if}
    <span class="step">
      {#if prev}<a href={prev.href} title="Previous: {prev.name} ([)">‹ {prev.name}</a>{/if}
      {#if next}<a href={next.href} title="Next: {next.name} (])">{next.name} ›</a>{/if}
    </span>
  </nav>

  <div class="title">
    <InlineText
      value={project.name}
      label="Project name"
      variant="title"
      editable={local}
      onsave={onrename}
    />
    <span class="badges">
      <Badge tone={local ? 'neutral' : 'warn'} title={local ? 'On this machine' : 'Read-only here'}>
        {hostLabel(project.host)}
      </Badge>
      {#if state}<Badge tone={STATE_TONE[state]}>{state}</Badge>{/if}
      {#if project.archived && state !== 'archived'}<Badge tone="neg">archived</Badge>{/if}
      {#if project.type}<Badge dot={typeColor(project.type)}>{project.type}</Badge>{/if}
      {#if project.framework && project.framework !== 'unknown'}
        <Badge dot={frameworkColor(project.framework)}>{project.framework}</Badge>
      {/if}
      {#if project.runner}<Badge>{project.runner}</Badge>{/if}
      {#if git?.status === 'dirty'}<Badge tone="warn">uncommitted</Badge>{/if}
      {#if running}<Badge tone="pos">running</Badge>{/if}
    </span>
  </div>

  <div class="line">
    <code class="path">{tildify(project.path)}</code>
    <Button onclick={copyPath} title="Copy the full path">Copy</Button>
    <HostnameChip path={project.path} />
    {#each twins as twin (twin.href)}
      <a class="twin t-caption" href={twin.href} title={twin.path}>also on {hostLabel(twin.host)}</a>
    {/each}
  </div>

  <InlineText
    value={project.description ?? ''}
    label="Description"
    placeholder="No description"
    editable={local}
    onsave={ondescription}
  />

  {#if local}
    <TagInput {tags} {vocabulary} onchange={ontags} />
  {:else if tags.length}
    <div class="line">{#each tags as tag (tag)}<Badge>#{tag}</Badge>{/each}</div>
  {/if}

  {#if local}
    <div class="line actions">
      <ProjectActions {project} {...actions} />
      {#if running}
        <Button variant="danger" onclick={onstop} title="Stop the dev server on the project's port">
          Stop
        </Button>
      {/if}
    </div>
  {/if}
</header>

<style>
  .band {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) 0 var(--space-4);
  }

  .crumbs {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .crumbs a {
    color: var(--color-muted);
    text-decoration: none;
  }

  .crumbs a:hover {
    color: var(--color-accent);
  }

  .step {
    display: inline-flex;
    gap: var(--space-3);
    margin-left: auto;
  }

  .title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
  }

  .badges,
  .line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }

  .path {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-muted);
    overflow-wrap: anywhere;
  }

  .twin {
    color: var(--color-info);
  }

  .actions {
    margin-top: var(--space-1);
  }
</style>
