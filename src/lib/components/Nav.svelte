<script lang="ts">
import { page } from '$app/state'
import Icon from '$lib/components/icons/Icon.svelte'
import type { IconName } from '$lib/components/icons/paths'
import { theme, toggleTheme } from '$lib/theme.svelte'

const links: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Projects', icon: 'folder' },
  { href: '/ports', label: 'Ports', icon: 'globe' },
  { href: '/system', label: 'System', icon: 'terminal' },
  { href: '/templates', label: 'Templates', icon: 'rows' },
  { href: '/claude-tree', label: 'Claude Tree', icon: 'tree' },
]

function isActive(href: string): boolean {
  return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href)
}
</script>

<nav>
  <div class="inner">
    <a class="wordmark" href="/">atlas</a>
    <div class="links">
      {#each links as link (link.href)}
        <a href={link.href} class="link" aria-current={isActive(link.href) ? 'page' : undefined}>
          <Icon name={link.icon} size={14} />
          {link.label}
        </a>
      {/each}
    </div>
    <button
      class="theme"
      type="button"
      onclick={toggleTheme}
      aria-label="Toggle light / dark theme"
    >
      <Icon name={theme.mode === 'dark' ? 'sun' : 'moon'} size={15} />
    </button>
  </div>
</nav>

<style>
  nav {
    position: sticky;
    top: 0;
    z-index: 60;
    height: var(--nav-h);
    background: var(--color-bg);
    border-bottom: var(--hairline) solid var(--color-border);
  }

  .inner {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    height: 100%;
    margin: 0 auto;
    padding: 0 var(--page-pad);
  }

  .wordmark {
    font-family: var(--font-display);
    font-size: 18px;
    color: var(--color-fg);
    text-decoration: none;
  }

  .links {
    display: flex;
    gap: var(--space-1);
  }

  .link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);
    font-size: 13px;
    color: var(--color-muted);
    text-decoration: none;
    border-radius: var(--radius-sm);
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .link:hover {
    color: var(--color-fg);
    background: var(--color-hover);
  }

  .link[aria-current='page'] {
    color: var(--color-fg);
    background: var(--color-card-2);
  }

  /* One toggle for the whole app — every route sits under this nav. */
  .theme {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin-left: auto;
    color: var(--color-muted);
    background: transparent;
    border: var(--hairline) solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-out),
      color var(--duration-fast) var(--ease-out);
  }

  .theme:hover {
    background: var(--color-hover);
    color: var(--color-fg);
  }
</style>
