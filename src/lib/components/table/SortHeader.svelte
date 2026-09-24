<script lang="ts" generics="K extends string">
import Icon from '$lib/components/icons/Icon.svelte'
import type { TableSort } from '$lib/table-sort.svelte'

interface Props {
  sort: TableSort<K>
  key: K
  label: string
  class?: string
}

const { sort, key, label, class: cls = '' }: Props = $props()
const active = $derived(sort.key === key)
</script>

<th class={cls} aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : 'none'}>
  <button type="button" onclick={() => sort.by(key)}>
    {label}
    {#if active}<Icon name="chevronDown" size={10} />{/if}
  </button>
</th>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0;
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
  }

  button:hover,
  th[aria-sort='ascending'],
  th[aria-sort='descending'] {
    color: var(--color-fg);
  }

  th[aria-sort='ascending'] :global(svg) {
    transform: rotate(180deg);
  }
</style>
