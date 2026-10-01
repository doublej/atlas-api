<script lang="ts">
import { errorMessage } from '$lib/format'
import type { SlugCheck } from '$lib/hostnames/types'
import { http } from '$lib/http'

interface Props {
  path: string
  /** The `.atlas` slug; empty = the one the folder gives. */
  value: string
  /** The server's verdict on `value`; null while a check is pending. */
  verdict: SlugCheck | null
  /** The route's slug now — a save that moves it re-checks the field. */
  current?: string
}

let { path, value = $bindable(), verdict = $bindable(), current }: Props = $props()
let error = $state<string | null>(null)

const DEBOUNCE_MS = 250

$effect(() => {
  const slug = value.trim()
  const at = path
  void current
  verdict = null
  const timer = setTimeout(() => {
    const query = `slug=${encodeURIComponent(slug)}&path=${encodeURIComponent(at)}`
    http
      .get<SlugCheck>(`/api/hostnames/check?${query}`)
      .then((v) => {
        if (value.trim() !== slug) return
        verdict = v
        error = null
      })
      .catch((e) => (error = errorMessage(e)))
  }, DEBOUNCE_MS)
  return () => clearTimeout(timer)
})

const bad = $derived(verdict?.status === 'invalid' || verdict?.status === 'taken')
</script>

<label class="field">
  <span class="t-caption">Slug</span>
  <input
    bind:value
    placeholder={verdict?.slug ?? 'from the folder name'}
    spellcheck="false"
    autocomplete="off"
    aria-invalid={bad}
    aria-describedby="slug-verdict"
  />
</label>

<p id="slug-verdict" class="t-caption verdict" data-status={error ? 'invalid' : (verdict?.status ?? 'checking')}>
  {#if error}
    {error}
  {:else if !verdict}
    checking…
  {:else if verdict.status === 'invalid'}
    {verdict.reason}
  {:else if verdict.status === 'taken'}
    taken by {verdict.holder?.kind} {verdict.holder?.name}
  {:else if verdict.status === 'current'}
    this project's hostname{value.trim() ? '' : ' (from the folder name)'}
  {:else}
    free{value.trim() ? '' : ' (from the folder name)'}
  {/if}
</p>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .verdict {
    margin: 0;
    color: var(--color-muted);
  }

  .verdict[data-status='free'],
  .verdict[data-status='current'] {
    color: var(--color-pos);
  }

  .verdict[data-status='taken'],
  .verdict[data-status='invalid'] {
    color: var(--color-neg);
  }

</style>
