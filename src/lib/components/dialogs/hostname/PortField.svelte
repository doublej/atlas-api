<script lang="ts">
import { http } from '$lib/http'
import { portProblem } from './hostname.svelte'

interface Listening {
  port: number
  listening: boolean
  lanReachable: boolean
  command?: string
}

let { value = $bindable() }: { value: number | null } = $props()
let listen = $state<Listening | null>(null)

const problem = $derived(portProblem(value))

$effect(() => {
  const port = value
  listen = null
  if (port == null || portProblem(port)) return
  const timer = setTimeout(() => {
    http
      .get<Listening>(`/api/hostnames/port?port=${port}`)
      .then((r) => {
        if (value === port) listen = r
      })
      .catch(() => {})
  }, 250)
  return () => clearTimeout(timer)
})
</script>

<label class="field">
  <span class="t-caption">Dev port</span>
  <input
    type="number"
    min="1024"
    max="65535"
    step="1"
    bind:value
    placeholder="allocated on first run"
    aria-invalid={problem !== null}
    aria-describedby="port-note"
  />
</label>
<p id="port-note" class="t-caption note" class:bad={problem !== null}>
  {#if problem}
    {problem}
  {:else if value == null}
    the first run takes a free one from 4100–4999
  {:else if !listen}
    checking :{value}…
  {:else if !listen.listening}
    nothing listens on :{value} now
  {:else}
    {listen.command ?? 'something'} listens on :{value}{listen.lanReachable
      ? ''
      : ' — loopback only, atlas bridges it for the NAS'}
  {/if}
</p>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .note {
    margin: 0;
    color: var(--color-muted);
  }

  .note.bad {
    color: var(--color-neg);
  }
</style>
