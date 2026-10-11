<script lang="ts">
import { fetchReadme } from '$lib/browser/api'
import Notice from '$lib/components/feedback/Notice.svelte'
import PageState from '$lib/components/feedback/PageState.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import { errorMessage } from '$lib/format'
import type { GitFlow, GitStatus, Project } from '$lib/scanner'
import { getDynamicActions } from '$shared/actions'
import Section from './parts/Section.svelte'

interface Props {
  project: Project
  git: { status: GitStatus; branch?: string; flow?: GitFlow } | null
  /** Current version per template name, for flagging a project behind its scaffold. */
  templateVersions: Record<string, string>
}

const { project, git, templateVersions }: Props = $props()

const status = $derived(git?.status ?? project.git)
const branch = $derived(git?.branch ?? project.gitBranch)
const flow = $derived(git?.flow ?? project.flow)
const current = $derived(project.template ? templateVersions[project.template.name] : undefined)
const behind = $derived(current !== undefined && current !== project.template?.version)
const domains = $derived(getDynamicActions('domain-open', project))
const umami = $derived(getDynamicActions('umami-open', project))
const modified = $derived(new Date(project.modifiedAt))

let readme = $state<string | null>(null)
let readmeError = $state<string | null>(null)
let readmeDone = $state(false)
let readmeOpen = $state(false)
// The README is read from disk on this Mac, so only a local project has one to show.
const canRead = $derived(Boolean(project.readme && project.isLocal))
// Loading from the server render on, so the page never flashes "could not be read" first.
const readmeLoading = $derived(canRead && !readmeDone)

$effect(() => {
  if (!canRead) return
  fetchReadme(project.path)
    .then((text) => (readme = text))
    .catch((e) => (readmeError = errorMessage(e)))
    .finally(() => (readmeDone = true))
})

const long = $derived((readme?.length ?? 0) > 1500)
</script>

<Section id="overview" title="Overview">
  <dl class="facts">
    <dt>Stack</dt>
    <dd>
      {[project.type, project.framework !== 'unknown' && project.framework, project.runner]
        .filter(Boolean)
        .join(' · ') || 'not detected'}
    </dd>

    <dt>Git</dt>
    <dd>
      {#if !status || status === 'no-repo'}
        <span class="muted-2">{status ? 'not a repository' : 'not scanned on this host'}</span>
      {:else}
        <span class="mono">{branch ?? '—'}</span>
        <Badge tone={status === 'clean' ? 'pos' : status === 'dirty' ? 'warn' : 'neg'}>{status}</Badge>
        {#if flow}
          <span class="muted">
            {flow.policy}{flow.integration ? ` · ${flow.integration} → ${flow.trunk}` : ` · ${flow.trunk}`}
            {flow.owner ? ` · ${flow.owner}` : ''}
          </span>
        {/if}
      {/if}
    </dd>

    <dt>Modified</dt>
    <dd><time datetime={project.modifiedAt}>{modified.toLocaleString()}</time></dd>

    {#if project.devCommand}
      <dt>Dev command</dt>
      <dd class="mono">{project.devCommand}</dd>
    {/if}

    {#if project.template}
      <dt>Template</dt>
      <dd>
        <a href="/templates?t={encodeURIComponent(project.template.name)}">{project.template.name}</a>
        <span class="mono">v{project.template.version}</span>
        {#if behind}<Badge tone="warn">template at v{current}</Badge>{/if}
      </dd>
    {/if}

    <dt>Domains</dt>
    <dd>
      {#each domains as d (d.value)}
        <a href={d.value} target="_blank" rel="noreferrer">{d.name}</a>
      {:else}
        <span class="muted-2">none found</span>
      {/each}
    </dd>

    <dt>Umami</dt>
    <dd>
      {#each umami as u (u.value)}
        <a href={u.value} target="_blank" rel="noreferrer" class="mono">{u.name}</a>
      {:else}
        <span class="muted-2">no tracking snippet</span>
      {/each}
    </dd>

    {#if project.deploy?.length}
      <dt>Deploy</dt>
      <dd>
        {#each project.deploy as d (d.platform)}
          {#if d.url}
            <a href={d.url} target="_blank" rel="noreferrer">{d.platform}</a>
          {:else}
            <span>{d.platform}</span>
          {/if}
        {/each}
      </dd>
    {/if}

    {#if project.promotion}
      <dt>Promotion</dt>
      <dd>
        {project.promotion.status}
        {#each Object.entries(project.promotion.platforms) as [platform, state] (platform)}
          <Badge>{platform}: {state}</Badge>
        {/each}
      </dd>
    {/if}
  </dl>

  {#if flow?.drift}
    <div class="notice"><Notice tone="warn"><strong>Off the branch flow:</strong> {flow.drift}</Notice></div>
  {/if}
  {#if behind}
    <div class="notice">
      <Notice tone="warn">
        The scaffold is behind its template (v{project.template?.version} → v{current}). Run
        <code>/update-scaffold</code> in the project.
      </Notice>
    </div>
  {/if}

  {#if project.readme}
    <h3>README</h3>
    <PageState loading={readmeLoading} error={readmeError} empty={!readme && !readmeLoading}
               emptyText={project.isLocal ? 'README could not be read.' : 'README is on another machine.'}>
      <pre class="readme" class:clipped={long && !readmeOpen}>{readme}</pre>
      {#if long}
        <Button onclick={() => (readmeOpen = !readmeOpen)}>{readmeOpen ? 'Show less' : 'Show all'}</Button>
      {/if}
    </PageState>
  {/if}
</Section>

<style>
  .notice {
    margin-top: var(--space-3);
  }

  .readme {
    margin: 0 0 var(--space-2);
    padding: var(--space-3);
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--color-fg-2);
    background: var(--color-card-2);
    border-radius: var(--radius-sm);
  }

  .readme.clipped {
    max-height: 320px;
    overflow: hidden;
    mask-image: linear-gradient(#000 70%, transparent);
  }
</style>
