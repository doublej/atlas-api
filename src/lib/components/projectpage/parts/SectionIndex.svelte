<script lang="ts">
/** The project page's side index: anchors to its section cards. */
const SECTIONS = [
  ['overview', 'Overview'],
  ['run', 'Run'],
  ['work', 'Work'],
  ['claude', 'Claude'],
  ['settings', 'Settings'],
] as const
</script>

<nav class="index" aria-label="Sections">
  {#each SECTIONS as [id, label] (id)}<a href="#{id}">{label}</a>{/each}
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

  a {
    padding: var(--space-1) var(--space-3);
    font-size: 13px;
    color: var(--color-muted);
    text-decoration: none;
    border-left: 2px solid var(--color-border);
  }

  a:hover {
    color: var(--color-fg);
    border-left-color: var(--color-accent);
  }

  /* A phone gets the index as one sticky scrolling row under the nav. */
  @media (max-width: 768px) {
    .index {
      top: var(--nav-h);
      z-index: 10;
      flex-direction: row;
      overflow-x: auto;
      padding: var(--space-2) 0;
      background: var(--color-bg);
    }

    a {
      flex: none;
      border-left: none;
      border-bottom: 2px solid var(--color-border);
    }
  }
</style>
