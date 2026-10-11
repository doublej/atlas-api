<script lang="ts">
import type { Project } from '$lib/scanner'
import Section from './parts/Section.svelte'

const { project }: { project: Project } = $props()

const setup = $derived(project.claudeSetup)
const files = $derived(project.agentFiles)
const tokens = (n?: number): string => (n == null ? '—' : `~${n.toLocaleString()} tokens`)
</script>

<Section id="claude" title="Claude">
  {#snippet actions()}
    {#if project.isLocal}
      <a class="tree" href="/claude-tree?root={encodeURIComponent(project.path)}">Open the context tree</a>
    {/if}
  {/snippet}

  <dl class="facts">
    <dt>CLAUDE.md</dt>
    <dd class="num">{files?.claude ? tokens(files.claude.tokens) : 'none'}</dd>
    <dt>AGENTS.md</dt>
    <dd class="num">{files?.agents ? tokens(files.agents.tokens) : 'none'}</dd>
    <dt>MCP servers</dt>
    <dd>
      {#each setup?.mcpServers ?? [] as server (server)}
        <span class="mono" class:off={setup?.mcpDisabled?.includes(server)}>{server}</span>
      {:else}
        <span class="muted-2">none scoped to this project</span>
      {/each}
    </dd>
    <dt>.claude/</dt>
    <dd>
      {setup?.agents ?? 0} agents · {setup?.commands ?? 0} commands · {setup?.skills ?? 0} skills ·
      {setup?.rules ?? 0} rules
    </dd>
    <dt>Hooks</dt>
    <dd>{setup?.hooks?.join(', ') || 'none'}</dd>
    <dt>Settings files</dt>
    <dd>{setup?.settings?.join(' + ') || 'none'}</dd>
  </dl>
</Section>

<style>
  .tree {
    font-size: 12px;
    color: var(--color-accent);
    text-decoration: none;
  }

  .tree:hover {
    text-decoration: underline;
  }

  .off {
    color: var(--color-muted-2);
    text-decoration: line-through;
  }
</style>
