<script lang="ts">
import Icon from '$lib/components/icons/Icon.svelte'

interface Props {
  filteredCount: number
  totalCount: number
  refreshing: boolean
}

const { filteredCount, totalCount, refreshing }: Props = $props()
</script>

<header>
  <div class="figure">
    <!-- The one display numeral on the page; every other number is mono. -->
    <span class="value">{filteredCount}</span>
    <span class="label">
      <span class="t-eyebrow">Projects</span>
      <span class="t-caption num">of {totalCount}</span>
    </span>
  </div>

  <div class="right">
    {#if refreshing}
      <span class="refreshing t-caption">
        <Icon name="refresh" size={13} />
        Refreshing
      </span>
    {/if}
  </div>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: var(--nav-h);
  }

  .figure {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .value {
    font-family: var(--font-display);
    font-size: 36px;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .label {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .refreshing {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-muted);
  }
</style>
