<script lang="ts">
import Icon from '$lib/components/icons/Icon.svelte'
import type { Project } from '$lib/scanner'
import { getDynamicActions } from '$shared/actions'

interface Props {
  project: Project
  hostname?: { local: string; remote: string }
}

const { project, hostname }: Props = $props()

// Domains and analytics links both come from the shared registry's dynamic
// actions, so their URL shapes stay defined in one place for every consumer.
const domains = $derived(getDynamicActions('domain-open', project))
const umami = $derived(getDynamicActions('umami-open', project))
</script>

{#if hostname}
  <a href={hostname.local} target="_blank" rel="noreferrer" class="link" title={hostname.remote}>
    <Icon name="link" size={11} />
    {hostname.local.replace(/^https?:\/\//, '')}
  </a>
{/if}

{#each domains as link (link.value)}
  <a href={link.value} target="_blank" rel="noreferrer" class="link">
    <Icon name="globe" size={11} />
    {link.name}
  </a>
{/each}

{#each umami as link (link.value)}
  <a href={link.value} target="_blank" rel="noreferrer" class="link" title={link.action.label}>
    <Icon name="chart" size={11} />
    umami
  </a>
{/each}

<style>
  .link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 12px;
    color: var(--color-muted);
    text-decoration: none;
    white-space: nowrap;
  }

  .link:hover {
    color: var(--color-accent);
    text-decoration: underline;
  }

  /* A long dev hostname breaks on a phone instead of running off the row. */
  @media (max-width: 768px) {
    .link {
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }
</style>
