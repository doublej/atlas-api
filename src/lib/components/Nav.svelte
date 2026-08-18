<script lang="ts">
import { page } from '$app/state'
import Icon from '$lib/components/icons/Icon.svelte'
import type { IconName } from '$lib/components/icons/paths'

const links: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Projects', icon: 'folder' },
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
    max-width: var(--col-max);
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
</style>
