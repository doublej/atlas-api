<script lang="ts">
import type { Snippet } from 'svelte'

interface Props {
  /** Drops the internal padding for surfaces that manage their own rows. */
  flush?: boolean
  children: Snippet
}

const { flush = false, children }: Props = $props()
</script>

<section class="card" class:flush>
  {@render children()}
</section>

<style>
  /*
   * The canonical card: a neutral outer hairline, a second accent hairline 4px
   * inside it drawn with mask-composite so the radius stays clean, and a halo
   * offset up-and-left. Every card is lit from the same corner — that
   * consistency is the signature, so this treatment stays on containers only.
   */
  .card {
    position: relative;
    background: var(--color-card);
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--card-pad);
    box-shadow: var(--halo-card), var(--hairline-highlight);
  }

  .card.flush {
    padding: 0;
  }

  .card::before {
    content: '';
    position: absolute;
    inset: 4px;
    border-radius: calc(var(--radius-lg) - 4px);
    padding: var(--hairline);
    background: var(--grad-border-card);
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask-composite: exclude;
    pointer-events: none;
  }
</style>
