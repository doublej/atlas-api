<script lang="ts" module>
import { getContext, setContext } from 'svelte'

const PLATE = Symbol('side-nav-plate')

/** What a FeatureHeader inside a SideNav shows above its title: the tab's number and the page. */
export interface Plate {
  readonly page: string
  readonly index: string
}

export function getPlate(): Plate | undefined {
  return getContext<Plate | undefined>(PLATE)
}

/** `1` → `01`: the number a tab carries in the menu and on its section's header. */
export function plateIndex(position: number): string {
  return String(position + 1).padStart(2, '0')
}

export interface SideTab {
  /** The `?tab=` value. */
  id: string
  label: string
  /** One line under the label saying what the tab holds; hidden on a narrow screen. */
  hint?: string
  /** How many things in the tab need attention; shown as a red count when above 0. */
  alert?: number
}
</script>

<script lang="ts">
import type { Snippet } from 'svelte'

interface Props {
  /** The page heading above the menu. */
  title: string
  /** The menu's accessible name, e.g. "System sections". */
  label: string
  tabs: SideTab[]
  /** The id of the tab on screen. */
  active: string
  /** Lines between the heading and the menu (the /disk free-space summary). */
  summary?: Snippet
  /** Extra class on <main>, for page CSS that hangs off it. */
  class?: string
  /** The active tab's content. */
  children: Snippet
}

const { title, label, tabs, active, summary, class: cls = '', children }: Props = $props()

let nav = $state<HTMLElement>()

setContext<Plate>(PLATE, {
  get page() {
    return title
  },
  get index() {
    return plateIndex(tabs.findIndex((t) => t.id === active))
  },
})

// Below 768px the menu scrolls sideways: keep the open tab in view (a no-op as a column). On
// every resize too: a page scrollbar that appears once the content loads narrows the menu.
$effect(() => {
  const current = nav?.querySelector<HTMLElement>(`[href="?tab=${active}"]`)
  if (!nav || !current) return
  const menu = nav
  const center = () => {
    const offset = current.getBoundingClientRect().left - menu.getBoundingClientRect().left
    menu.scrollLeft += offset - (menu.clientWidth - current.offsetWidth) / 2
  }
  center()
  const observer = new ResizeObserver(center)
  observer.observe(menu)
  return () => observer.disconnect()
})
</script>

<!-- A page of tabs down the side (?tab=), one shown at a time. The menu doubles as a status
     board: each line says what it holds and how much of it needs you. Tabs are numbered like an
     atlas's plates, and the section's FeatureHeader repeats the number. Below 768px it turns into
     a horizontal scroller above the content. -->
<main class={cls}>
  <aside>
    <h1>{title}</h1>
    {#if summary}<div class="summary t-caption muted">{@render summary()}</div>{/if}
    <nav aria-label={label} bind:this={nav}>
      {#each tabs as tab, i (tab.id)}
        <a href="?tab={tab.id}" aria-current={active === tab.id ? 'page' : undefined}>
          <span class="idx num" aria-hidden="true">{plateIndex(i)}</span>
          <span class="label">
            {tab.label}
            {#if tab.alert}<span class="alert num">{tab.alert}</span>{/if}
          </span>
          {#if tab.hint}<span class="hint t-caption">{tab.hint}</span>{/if}
        </a>
      {/each}
    </nav>
  </aside>

  <div class="content">
    {@render children()}
  </div>
</main>

<style>
  main {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: var(--space-8);
    margin: 0 auto;
    padding: var(--space-6) var(--page-pad) var(--space-16);
  }

  aside {
    position: sticky;
    top: calc(var(--nav-h) + var(--space-6));
    align-self: start;
    min-width: 0;
  }

  h1 {
    margin: 0 0 var(--space-4);
    font-family: var(--font-display);
    font-size: 26px;
    font-weight: 400;
    line-height: 1;
    letter-spacing: -0.01em;
  }

  h1:has(+ .summary) {
    margin-bottom: var(--space-2);
  }

  .summary {
    margin-bottom: var(--space-4);
  }

  /* One hairline rail down the menu; the open tab lights its stretch of it in the accent. */
  nav {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  nav::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--hairline);
    background: var(--color-border-strong);
  }

  nav a {
    position: relative;
    display: grid;
    grid-template-columns: 2ch minmax(0, 1fr);
    column-gap: var(--space-3);
    row-gap: 1px;
    padding: 7px var(--space-3) 7px 14px;
    color: var(--color-muted);
    text-decoration: none;
    transition: color var(--duration-fast) var(--ease-out);
  }

  nav a::before {
    content: '';
    position: absolute;
    inset: 4px auto 4px 0;
    width: 2px;
    border-radius: 1px;
    background: transparent;
    transition: background var(--duration-fast) var(--ease-out);
  }

  nav a:hover {
    color: var(--color-fg);
  }

  nav a:hover::before {
    background: var(--color-border-strong);
  }

  nav a[aria-current='page'] {
    color: var(--color-fg);
  }

  nav a[aria-current='page']::before {
    background: var(--color-accent);
  }

  .idx {
    grid-row: span 2;
    padding-top: 2px;
    font-size: 11px;
    color: var(--color-muted-2);
  }

  [aria-current='page'] .idx {
    color: var(--color-accent);
  }

  .label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: 13px;
    font-weight: 500;
  }

  .hint {
    color: var(--color-muted-2);
  }

  .alert {
    min-width: 16px;
    padding: 0 4px;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
    color: var(--color-neg);
    background: var(--color-neg-soft);
    border-radius: var(--radius-full);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--section-gap);
    min-width: 0;
  }

  @media (max-width: 768px) {
    main {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-4);
      padding-inline: var(--space-4);
    }

    aside {
      position: static;
    }

    h1,
    h1:has(+ .summary),
    .summary {
      margin-bottom: var(--space-2);
    }

    nav {
      flex-direction: row;
      overflow-x: auto;
    }

    nav::before {
      inset: auto 0 0;
      width: auto;
      height: var(--hairline);
    }

    nav a {
      flex: none;
      grid-template-columns: auto auto;
      column-gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      white-space: nowrap;
    }

    nav a::before {
      inset: auto var(--space-2) 0;
      width: auto;
      height: 2px;
    }

    .idx {
      grid-row: auto;
      padding-top: 0;
      align-self: center;
    }

    .hint {
      display: none;
    }
  }
</style>
