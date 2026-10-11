<script lang="ts">
import PageState from '$lib/components/feedback/PageState.svelte'
import Badge from '$lib/components/ui/Badge.svelte'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'

/** The project's agent-log journal: latest handoff, live intents, recent events, open sessions. */
const { path }: { path: string } = $props()

interface JournalEvent {
  seq: number
  at_ms: number
  kind: string
  op_id: string
  actor: string
  summary: string
  scopes: string[]
  outcome: string
}

interface Journal {
  events: JournalEvent[]
  activeIntents: number
  latestHandoff: JournalEvent | null
  coordination?: { mode?: string; sessions?: { sessionId: string; actor: string }[] }
}

let journal = $state<Journal | null>(null)
let error = $state<string | null>(null)

$effect(() => {
  http
    .get<Journal>(`/api/agent-log?path=${encodeURIComponent(path)}`)
    .then((j) => (journal = j))
    .catch((e) => (error = errorMessage(e)))
})

const when = (ms: number): string => new Date(ms).toLocaleString()
const events = $derived(
  (journal?.events ?? [])
    .filter((e) => e.seq !== journal?.latestHandoff?.seq)
    .slice(-12)
    .reverse(),
)
const sessions = $derived(journal?.coordination?.sessions ?? [])
const empty = $derived(
  !!journal && !journal.events.length && !journal.latestHandoff && !sessions.length,
)
</script>

<PageState loading={!journal && !error} {error} {empty} emptyText="No journal entries in the last 30 minutes.">
  {#if journal}
    <dl class="facts">
      <dt>Active intents</dt>
      <dd class="num">{journal.activeIntents}</dd>
      {#if sessions.length}
        <dt>Open sessions</dt>
        <dd>
          {#each sessions as s (s.sessionId)}<Badge>{s.actor}</Badge>{/each}
        </dd>
      {/if}
      {#if journal.latestHandoff}
        <dt>Latest handoff</dt>
        <dd>
          <span>{journal.latestHandoff.summary}</span>
          <span class="muted-2 t-caption">{journal.latestHandoff.actor} · {when(journal.latestHandoff.at_ms)}</span>
        </dd>
      {/if}
    </dl>

    {#if events.length}
      <ul class="events">
        {#each events as e (e.seq)}
          <li>
            <Badge tone={e.kind === 'intent' ? 'info' : e.kind === 'end' ? 'pos' : 'neutral'}>{e.kind}</Badge>
            <span class="summary">{e.summary}</span>
            <span class="muted-2 t-caption">{e.actor} · {when(e.at_ms)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</PageState>

<style>
  .events {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
    font-size: 12px;
  }

  .events li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .summary {
    color: var(--color-fg-2);
  }
</style>
