<script lang="ts">
import Icon from '$lib/components/icons/Icon.svelte'
import type { Project } from '$lib/scanner'

interface Props {
  project: Project
}

const { project }: Props = $props()

const setup = $derived(project.claudeSetup)
const files = $derived(project.agentFiles)

/** ~8.7k reads faster than 8659 in a row that already carries five other numbers. */
function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/** `3 agents` / `1 agent` — the count is the point, the noun is the label. */
const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`

const extensions = $derived(
  [
    setup?.agents && plural(setup.agents, 'agent'),
    setup?.commands && plural(setup.commands, 'command'),
    setup?.skills && plural(setup.skills, 'skill'),
    setup?.rules && plural(setup.rules, 'rule'),
  ].filter(Boolean) as string[],
)

const servers = $derived(setup?.mcpServers ?? [])
const disabled = $derived(new Set(setup?.mcpDisabled ?? []))
const hasAnything = $derived(!!files || !!setup)
</script>

{#if hasAnything}
  <div class="claude">
    {#if files?.claude}
      <a
        class="item file"
        href="/claude-tree?root={encodeURIComponent(project.path)}"
        title="CLAUDE.md — ~{files.claude.tokens} tokens. Open the context tree."
      >
        <Icon name="tree" size={11} />
        CLAUDE.md
        <span class="num">~{formatTokens(files.claude.tokens)}</span>
      </a>
    {/if}

    {#if files?.agents}
      <span class="item" title="AGENTS.md — ~{files.agents.tokens} tokens">
        AGENTS.md
        <span class="num">~{formatTokens(files.agents.tokens)}</span>
      </span>
    {/if}

    {#each servers as server (server)}
      <!-- A server switched off for this project reads dimmed and struck through. -->
      <span
        class="item mcp"
        class:off={disabled.has(server)}
        title={disabled.has(server)
          ? `MCP ${server} — scoped to this project, switched off`
          : `MCP ${server}`}
      >
        <Icon name="link" size={11} />
        {server}
      </span>
    {/each}

    {#each extensions as label (label)}
      <span class="item">{label}</span>
    {/each}

    {#if setup?.hooks}
      <span class="item" title="Hooks: {setup.hooks.join(', ')}">
        {plural(setup.hooks.length, 'hook')}
      </span>
    {/if}

    {#if setup?.settings}
      <span class="item" title="Settings files: {setup.settings.join(', ')}">
        {setup.settings.join(' + ')} settings
      </span>
    {/if}
  </div>
{/if}

<style>
  .claude {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
  }

  .item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--color-muted-2);
    white-space: nowrap;
  }

  .file {
    color: var(--color-muted);
    text-decoration: none;
  }

  .file:hover {
    color: var(--color-accent);
    text-decoration: underline;
  }

  .mcp {
    font-family: var(--font-mono);
    color: var(--color-accent);
  }

  .mcp.off {
    color: var(--color-muted-2);
    text-decoration: line-through;
  }

  .num {
    font-family: var(--font-mono);
  }
</style>
