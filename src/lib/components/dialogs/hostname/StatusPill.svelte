<script lang="ts">
import Badge from '$lib/components/ui/Badge.svelte'
import Button from '$lib/components/ui/Button.svelte'
import type { HostnameStatus } from '$lib/hostnames/types'

interface Props {
  status: HostnameStatus
  error?: string
  /** Shown as a Retry button while `failed`. */
  onretry?: () => unknown
}

const { status, error, onretry }: Props = $props()

const LABEL: Record<HostnameStatus, string> = {
  none: 'no hostname',
  syncing: 'syncing',
  issuing: 'issuing certificate',
  live: 'live',
  failed: 'failed',
}
const TONE = {
  none: 'neutral',
  syncing: 'info',
  issuing: 'warn',
  live: 'pos',
  failed: 'neg',
} as const
</script>

<span class="pill" role="status" aria-live="polite">
  <Badge tone={TONE[status]} title={error}>{LABEL[status]}</Badge>
  {#if status === 'failed' && onretry}
    <Button onclick={onretry}>Retry</Button>
  {/if}
</span>
{#if status === 'failed' && error}
  <span class="t-caption err">{error}</span>
{/if}

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  .err {
    color: var(--color-neg);
    overflow-wrap: anywhere;
  }
</style>
