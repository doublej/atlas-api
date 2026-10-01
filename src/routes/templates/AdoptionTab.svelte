<script lang="ts">
import type { TemplateAdoption } from '$lib/adoption'
import Badge from '$lib/components/ui/Badge.svelte'
import Card from '$lib/components/ui/Card.svelte'

let {
  adoption,
  updateScaffoldTool,
}: { adoption: TemplateAdoption | null; updateScaffoldTool: string } = $props()

const updateCommand = (projectPath: string) =>
  `python3 ${updateScaffoldTool} ${projectPath} --apply`
</script>

<div class="adoption-list">
  {#if !adoption || adoption.totalCount === 0}
    <p class="note muted">No adopters yet.</p>
  {:else}
    <p class="note">
      current version {adoption.currentVersion || '—'} · {adoption.totalCount}
      adopter{adoption.totalCount === 1 ? '' : 's'}
      {#if adoption.behindCount > 0}· {adoption.behindCount} behind{/if}
    </p>
    {#each adoption.projects as p (p.path)}
      <Card>
        <div class="adopter-head">
          <a class="adopter-link" href="/?q={encodeURIComponent(p.name)}">{p.name}</a>
          <Badge tone="neutral">v{p.version || '—'}</Badge>
          {#if p.behind}<Badge tone="warn">behind</Badge>{/if}
        </div>
        {#if p.behind}
          <code class="update-cmd">{updateCommand(p.path)}</code>
        {/if}
      </Card>
    {/each}
  {/if}
</div>

<style>
  .adoption-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .note {
    font-size: 12px;
    color: var(--color-fg-2);
    margin-bottom: var(--space-1);
  }
  .note.muted {
    color: var(--color-muted);
  }
  .adopter-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .adopter-link {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--color-fg);
    text-decoration: none;
  }
  .adopter-link:hover {
    color: var(--color-accent);
    text-decoration: underline;
  }
  .update-cmd {
    display: block;
    font-size: 12px;
    padding: var(--space-2);
    background: var(--color-card-2);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: pre;
  }
</style>
