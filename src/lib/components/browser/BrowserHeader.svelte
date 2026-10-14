<script lang="ts">
import FeatureHeader from '$lib/components/FeatureHeader.svelte'
import Icon from '$lib/components/icons/Icon.svelte'

interface Props {
  filteredCount: number
  totalCount: number
  refreshing: boolean
}

const { filteredCount, totalCount, refreshing }: Props = $props()
</script>

<FeatureHeader level={1} title="Projects" source="~/dev/.atlas-cache.json">
  {#snippet meta()}
    <span>{filteredCount} of {totalCount}</span>
    {#if refreshing}
      ·<span class="refreshing"><Icon name="refresh" size={12} /> refreshing</span>
    {/if}
  {/snippet}
</FeatureHeader>

<style>
  .refreshing {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
</style>
