<script lang="ts" module>
/** The project page's section cards in page order: the side index and each card's number. */
export const SECTIONS = [
  ['overview', 'Overview'],
  ['run', 'Run'],
  ['work', 'Work'],
  ['claude', 'Claude'],
  ['settings', 'Settings'],
] as const

export type SectionId = (typeof SECTIONS)[number][0]
</script>

<script lang="ts">
import { plateIndex } from '$lib/components/SideNav.svelte'
</script>

<!-- Numbered like the SideNav's index, on the same hairline rail; the section cards repeat the number. -->
<nav class="index" aria-label="Sections">
  {#each SECTIONS as [id, label], i (id)}
    <a href="#{id}"><span class="idx num" aria-hidden="true">{plateIndex(i)}</span>{label}</a>
  {/each}
</nav>

<style>
  .index {
    position: sticky;
    top: calc(var(--nav-h) + var(--space-4));
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-self: start;
  }

  .index::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--hairline);
    background: var(--color-border-strong);
  }

  a {
    position: relative;
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    padding: 7px var(--space-3) 7px 14px;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-muted);
    text-decoration: none;
    transition: color var(--duration-fast) var(--ease-out);
  }

  a::before {
    content: '';
    position: absolute;
    inset: 4px auto 4px 0;
    width: 2px;
    border-radius: 1px;
    background: transparent;
    transition: background var(--duration-fast) var(--ease-out);
  }

  a:hover {
    color: var(--color-fg);
  }

  a:hover::before {
    background: var(--color-accent);
  }

  .idx {
    font-size: 11px;
    color: var(--color-muted-2);
  }

  a:hover .idx {
    color: var(--color-accent);
  }

  /* A phone gets the index as one sticky scrolling row under the nav, the rail along its foot. */
  @media (max-width: 768px) {
    .index {
      top: var(--nav-h);
      z-index: 10;
      flex-direction: row;
      overflow-x: auto;
      padding-top: var(--space-2);
      background: var(--color-bg);
    }

    .index::before {
      inset: auto 0 0;
      width: auto;
      height: var(--hairline);
    }

    a {
      flex: none;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      white-space: nowrap;
    }

    a::before {
      inset: auto var(--space-2) 0;
      width: auto;
      height: 2px;
    }
  }
</style>
