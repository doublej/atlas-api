<script lang="ts">
import type { Snippet } from 'svelte'
import { getPlate } from './SideNav.svelte'

interface Props {
  title: string
  /** 1 for a page of its own (an h1), 2 for a section under a SideNav (an h2). */
  level?: 1 | 2
  /** The line above the title. Inside a SideNav it defaults to the tab's number and the page. */
  eyebrow?: string
  /** One plain sentence: what this feature does for you. */
  lede?: string
  /** Where the data comes from — a file, a command. Shown in mono at the end of the legend. */
  source?: string
  /** Live figures for the legend line: counts, sizes, when it was last read. */
  meta?: Snippet
  /** Controls on the title line. */
  actions?: Snippet
}

const { title, level = 2, eyebrow, lede, source, meta, actions }: Props = $props()

const plate = getPlate()
</script>

<!-- Every feature opens on a plate: number and page, a serif title, what it does, then a legend
     of live figures and the source, led by a small scale bar. -->
<header class="feature" class:page={level === 1}>
  {#if eyebrow}
    <p class="eyebrow">{eyebrow}</p>
  {:else if plate}
    <p class="eyebrow"><span class="idx">{plate.index}</span>{plate.page}</p>
  {/if}

  <svelte:element this={level === 1 ? 'h1' : 'h2'} class="title">{title}</svelte:element>

  {#if actions}<div class="actions">{@render actions()}</div>{/if}

  {#if lede}<p class="lede">{lede}</p>{/if}

  {#if meta || source}
    <p class="legend">
      {#if meta}<span class="meta">{@render meta()}</span>{/if}
      {#if source}<code class="source">{source}</code>{/if}
    </p>
  {/if}
</header>

<style>
  .feature {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    column-gap: var(--space-4);
    /* 20px to what follows. A parent that spaces its children with a flex gap sets this to what
       its gap leaves of those 20px, so every page has the same space under its plate. */
    margin-bottom: var(--feature-header-space, var(--space-5));
    padding-bottom: var(--space-4);
  }

  /* The plate's rule: fades out before it meets either edge, like every divider here. */
  .feature::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: var(--hairline);
    background: var(--grad-divider);
  }

  .feature > * {
    grid-column: 1 / -1;
    margin: 0;
    animation: rise var(--duration-slow) var(--ease-out) both;
  }

  .eyebrow {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-muted);
  }

  .idx {
    color: var(--color-accent);
  }

  .title {
    grid-column: 1;
    font-family: var(--font-display);
    font-size: 36px;
    font-weight: 400;
    line-height: 1.05;
    letter-spacing: -0.01em;
    color: var(--color-fg);
    overflow-wrap: anywhere;
    animation-delay: 40ms;
  }

  .page .title {
    font-size: 42px;
  }

  .actions {
    grid-column: 2;
    grid-row: 2;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-2);
    animation-delay: 40ms;
  }

  .lede {
    max-width: 68ch;
    margin-top: var(--space-2);
    font-size: 14px;
    line-height: 1.5;
    color: var(--color-fg-2);
    animation-delay: 80ms;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    margin-top: var(--space-3);
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--color-muted);
    animation-delay: 120ms;
  }

  /* A map's scale bar: alternate filled and open segments in a hairline frame. */
  .legend::before {
    content: '';
    flex: none;
    width: 24px;
    height: 4px;
    border: var(--hairline) solid var(--color-muted-2);
    background: repeating-linear-gradient(90deg, var(--color-muted-2) 0 6px, transparent 6px 12px);
  }

  .meta {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
  }

  .source {
    color: var(--color-muted-2);
  }

  .meta + .source {
    padding-left: var(--space-3);
    border-left: var(--hairline) solid var(--color-border-strong);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .feature > * {
      animation: none;
    }
  }

  @media (max-width: 768px) {
    .title {
      font-size: 28px;
    }

    .page .title {
      font-size: 32px;
    }

    .actions {
      grid-column: 1 / -1;
      grid-row: auto;
      justify-content: flex-start;
      margin-top: var(--space-3);
    }
  }
</style>
