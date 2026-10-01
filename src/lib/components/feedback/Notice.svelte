<script lang="ts">
interface Props {
  /** `null` hides it. Set by whatever just ran an action. */
  notice: { ok: boolean; note: string } | null
}

const { notice }: Props = $props()
</script>

{#if notice}
  <div class="notice" class:bad={!notice.ok} role="status">{notice.note}</div>
{/if}

<style>
  .notice {
    position: fixed;
    right: var(--space-4);
    bottom: var(--space-4);
    z-index: 80;
    max-width: 420px;
    padding: var(--space-2) var(--space-3);
    font-size: 12px;
    color: var(--color-fg);
    background: var(--color-bg-elev);
    border: var(--hairline) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .notice.bad {
    color: var(--color-neg);
    border-color: var(--color-neg);
  }
</style>
