<script lang="ts">
import type { GitStatus, Project } from '$lib/scanner'
import type { ActionDef } from '$shared/actions'
import ClaudeSetup from './ClaudeSetup.svelte'
import ProjectActions from './ProjectActions.svelte'
import ProjectBadges from './ProjectBadges.svelte'
import ProjectDetails from './ProjectDetails.svelte'
import ProjectLinks from './ProjectLinks.svelte'

interface Props {
  project: Project
  git?: { status: GitStatus; branch?: string }
  runningUrl?: string
  hostname?: { local: string; remote: string }
  /** True once the catalog spans more than one machine. */
  showHost?: boolean
  /** Current version per template name, for flagging a project behind its scaffold. */
  templateVersions?: Record<string, string>
  onRunDev: (project: Project) => void
  onRunScript: (project: Project, script: string) => void
  onRunJust: (project: Project, recipe: string) => void
  onIterm: (path: string) => void
  onFinder: (path: string) => void
  onRename: (project: Project) => void
  onMove: (project: Project) => void
  onAction: (action: ActionDef, project: Project) => void
}

const {
  project,
  git,
  runningUrl,
  hostname,
  showHost = false,
  templateVersions,
  ...handlers
}: Props = $props()

const GIT_TITLES: Record<string, string> = {
  clean: 'Clean working tree',
  dirty: 'Uncommitted changes',
  'no-repo': 'Not a git repository',
  error: 'Git error',
  loading: 'Loading git status',
}

const status = $derived(git?.status ?? 'loading')
const modified = $derived(new Date(project.modifiedAt).toLocaleDateString())
</script>

<li class="row" data-git={status}>
  <span class="git" data-status={status} title={GIT_TITLES[status]}></span>

  <div class="body">
    <div class="line">
      <strong class="name">{project.name}</strong>
      <ProjectBadges {project} {git} {showHost} {templateVersions} />
      {#if runningUrl}
        <a class="running" href={runningUrl} target="_blank" rel="noreferrer">
          <span class="pulse"></span>
          {runningUrl.replace(/^https?:\/\//, '')}
        </a>
      {/if}
      <time class="t-caption num" datetime={project.modifiedAt}>{modified}</time>
    </div>

    <div class="line secondary">
      <code class="path">{project.relativePath}</code>
      <ProjectLinks {project} {hostname} />
    </div>

    <ProjectDetails {project} />

    <ClaudeSetup {project} />
  </div>

  <div class="tools">
    <ProjectActions {project} {...handlers} />
  </div>
</li>

<style>
  .row {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-3);
    padding: var(--row-py) var(--row-px);
    list-style: none;
    transition: background var(--duration-fast) var(--ease-out);
  }

  /* Fade-out divider: rules never quite touch the surface edges. Each row is
     its own component, so the separator is drawn on every row's top edge and
     suppressed on whichever row opens a list. */
  .row::before {
    content: '';
    position: absolute;
    inset: 0 0 auto;
    height: var(--hairline);
    background: var(--grad-divider);
  }

  :global(.rows > li:first-child)::before {
    display: none;
  }

  .row:hover {
    background: var(--color-card-2);
  }

  .git {
    width: 6px;
    height: 6px;
    margin-top: 7px;
    border-radius: var(--radius-full);
    background: var(--status-idle);
    flex: none;
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
  .git[data-status='loading'] {
    background: var(--color-disabled);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }

  .name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-fg);
  }

  .line time {
    margin-left: auto;
    color: var(--color-muted-2);
  }

  .secondary {
    gap: var(--space-3);
  }

  .path {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-muted-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .running {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-pos);
    text-decoration: none;
  }

  .running:hover {
    text-decoration: underline;
  }

  .pulse {
    width: 5px;
    height: 5px;
    border-radius: var(--radius-full);
    background: var(--color-pos);
    animation: pulse 2s var(--ease-in-out) infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  /* Actions stay quiet until the row is engaged — the data is the design. */
  .tools {
    opacity: 0;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .row:hover .tools,
  .row:focus-within .tools {
    opacity: 1;
  }

  @media (hover: none), (max-width: 768px) {
    .tools {
      opacity: 1;
    }
  }
</style>
