<script lang="ts" module>
/** `python` for `python/fb-scrape`: where a project sits in the catalog. Windows paths too. */
export function folderOf(relativePath: string): string {
  return relativePath.split(/[\\/]/).slice(0, -1).join('/')
}
</script>

<script lang="ts">
import { stateOf } from '$lib/browser/filters'
import HostnameChip from '$lib/components/dialogs/hostname/HostnameChip.svelte'
import { type ProjectSummary, projectHref } from '$lib/project-summary'

/** The Name column: state dot, the name as a link to the project page, hostname chip, description. */
const { project: p }: { project: ProjectSummary } = $props()
const state = $derived(stateOf(p))
/** Shown before the name while the table is too narrow for its Folder column. */
const folder = $derived(folderOf(p.relativePath))
</script>

<span class="namecell">
  <span class="state" data-state={state ?? 'none'} title={state ? `state: ${state}` : 'no state tag'}></span>
  <a class="name" href={projectHref(p)}>
    {#if folder}<span class="folder">{folder}/</span>{/if}<span class="label">{p.name}</span>
  </a>
  <HostnameChip path={p.path} />
  {#if p.description}<span class="desc">{p.description}</span>{/if}
</span>

<style>
  /* The name keeps its width first; the hostname chip gives way next (down to its dot and a few
     letters), the description takes only what is left. */
  .namecell {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .namecell > :global(.chip) {
    min-width: 4rem;
  }

  /* A ring, not a dot, so it never reads as the git column's dot. */
  .state {
    flex: none;
    width: 7px;
    height: 7px;
    border: 1.5px solid var(--color-disabled);
    border-radius: var(--radius-full);
  }

  .state[data-state='active'] {
    border-color: var(--color-pos);
    background: var(--color-pos);
  }
  .state[data-state='parked'] {
    border-color: var(--color-warn);
  }
  .state[data-state='dormant'] {
    border-color: var(--color-muted-2);
  }
  .state[data-state='archived'] {
    border-color: var(--color-muted-2);
    border-style: dashed;
  }
  .state[data-state='none'] {
    border-color: transparent;
  }

  .name,
  .desc {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Capped, never shrunk: a flex shrink of a fraction of a pixel would already cut it with "…". */
  .name {
    display: flex;
    flex: none;
    max-width: calc(100% - 7px - var(--space-2));
    font-weight: 500;
    color: var(--color-fg);
    text-decoration: none;
  }

  .name:hover {
    color: var(--color-accent);
    text-decoration: underline;
  }

  /* A deep folder gives way before the name does. */
  .folder,
  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .folder {
    flex: 0 100 auto;
    min-width: 3ch;
    font-weight: 400;
    color: var(--color-muted-2);
  }

  .label {
    flex: 0 1 auto;
  }

  /* Too narrow to say both (a phone), or the Folder column's tier in ProjectTable, where the
     folder would say it twice. */
  @container table (max-width: 640px) {
    .folder {
      display: none;
    }
  }

  @container table (min-width: 1281px) {
    .folder {
      display: none;
    }
  }

  .namecell:has(> :global(.chip)) > .name {
    max-width: calc(100% - 4rem - 7px - 2 * var(--space-2));
  }

  .desc {
    flex: 1 1 0;
    color: var(--color-muted-2);
  }

  /* A phone's name column has no room beside the name; the opened row shows the chip. */
  @media (max-width: 768px) {
    .desc,
    .namecell > :global(.chip) {
      display: none;
    }
  }
</style>
