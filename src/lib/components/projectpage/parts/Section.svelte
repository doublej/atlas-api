<script lang="ts">
import type { Snippet } from 'svelte'
import { plateIndex } from '$lib/components/SideNav.svelte'
import Card from '$lib/components/ui/Card.svelte'
import { SECTIONS, type SectionId } from './SectionIndex.svelte'

/**
 * One card of the project page, anchored by `id` for the side index, whose number it repeats. A `<dl class="facts">`
 * inside renders as a two-column label/value grid; `<h3>` as a sub-heading.
 */
interface Props {
  id: SectionId
  title: string
  /** Trailing controls on the heading line. */
  actions?: Snippet
  children: Snippet
}

const { id, title, actions, children }: Props = $props()

const index = $derived(plateIndex(SECTIONS.findIndex(([s]) => s === id)))
</script>

<div class="section" {id}>
  <Card>
    <div class="head">
      <h2><span class="idx num" aria-hidden="true">{index}</span>{title}</h2>
      {#if actions}<span class="actions">{@render actions()}</span>{/if}
    </div>
    {@render children()}
  </Card>
</div>

<style>
  .section {
    scroll-margin-top: calc(var(--nav-h) + var(--space-4));
  }

  .head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  h2 {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin: 0;
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 400;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  .idx {
    font-size: 11px;
    color: var(--color-accent);
  }

  .actions {
    display: inline-flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-left: auto;
  }

  .section :global(h3) {
    margin: var(--space-4) 0 var(--space-2);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-muted);
  }

  .section :global(dl.facts) {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: var(--space-2) var(--space-4);
    margin: 0;
    font-size: 13px;
  }

  .section :global(dl.facts dt) {
    color: var(--color-muted);
  }

  .section :global(dl.facts dd) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
    margin: 0;
    color: var(--color-fg-2);
    overflow-wrap: anywhere;
  }

  .section :global(dl.facts a) {
    color: var(--color-accent);
    text-decoration: none;
  }

  .section :global(dl.facts a:hover) {
    text-decoration: underline;
  }

  @media (max-width: 560px) {
    .section :global(dl.facts) {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }

    .section :global(dl.facts dd) {
      margin-bottom: var(--space-2);
    }
  }
</style>
