<script lang="ts">
import Button from '$lib/components/ui/Button.svelte'
import type { Project } from '$lib/scanner'
import AgentJournal from './parts/AgentJournal.svelte'
import Section from './parts/Section.svelte'

interface Props {
  project: Project
  /** Opens the new-ticket dialog. */
  onticket: () => void
}

const { project, onticket }: Props = $props()

const local = $derived(project.isLocal === true)
const sessions = $derived(project.claudeSessions)
</script>

<Section id="work" title="Work">
  {#snippet actions()}
    {#if local && project.beads}<Button onclick={onticket}>New ticket</Button>{/if}
  {/snippet}

  <dl class="facts">
    <dt>Beads</dt>
    <dd>
      {#if project.beads}
        <span><span class="num">{project.beads.open}</span> open</span>
        <span><span class="num">{project.beads.inProgress}</span> in progress</span>
        <span class="muted-2"><span class="num">{project.beads.closed}</span> closed</span>
      {:else}
        <span class="muted-2">no beads database</span>
      {/if}
    </dd>

    <dt>Claude sessions</dt>
    <dd>
      {#if sessions}
        <span><span class="num">{sessions.count}</span> sessions</span>
        <span class="muted-2">last {new Date(sessions.lastAt).toLocaleString()}</span>
      {:else}
        <span class="muted-2">none recorded</span>
      {/if}
    </dd>

    {#if sessions?.summary}
      <dt>Last session</dt>
      <dd>{sessions.summary}</dd>
    {/if}
  </dl>

  {#if local}
    <h3>Agent journal</h3>
    <AgentJournal path={project.path} />
  {/if}
</Section>
