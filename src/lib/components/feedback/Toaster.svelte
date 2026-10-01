<script lang="ts">
import Icon from '$lib/components/icons/Icon.svelte'
import { dismiss, toasts } from '$lib/toast.svelte'
</script>

<!-- Mounted once, in the root layout. -->
<div class="toaster">
  {#each toasts as t (t.id)}
    <div class="toast t-small" data-tone={t.tone} role={t.tone === 'error' ? 'alert' : 'status'}>
      <span>{t.message}</span>
      <button type="button" aria-label="Dismiss" onclick={() => dismiss(t.id)}>
        <Icon name="x" size={12} />
      </button>
    </div>
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    right: var(--space-4);
    bottom: var(--space-4);
    z-index: 80;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
    max-width: min(420px, calc(100vw - var(--space-8)));
  }

  /* Floating surfaces are the one place shadows are allowed. */
  .toast {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    color: var(--color-fg);
    background: var(--color-bg-elev);
    border: var(--hairline) solid var(--color-border-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
    overflow-wrap: anywhere;
  }

  .toast[data-tone='error'] {
    color: var(--color-neg);
    border-color: var(--color-neg);
  }

  button {
    display: inline-flex;
    flex: none;
    padding: 2px;
    margin-top: 2px;
    color: var(--color-muted);
    background: none;
    border: none;
    border-radius: var(--radius-xs);
    cursor: pointer;
  }

  button:hover {
    color: var(--color-fg);
  }
</style>
