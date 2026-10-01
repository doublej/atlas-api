<script lang="ts">
/** A row's recent CPU or memory, oldest sample first. Nothing until there are two samples. */
const { values, label }: { values: number[]; label: string } = $props()

const W = 44
const H = 14
const points = $derived.by(() => {
  if (values.length < 2) return ''
  const max = Math.max(...values) || 1
  const step = W / (values.length - 1)
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(H - 1 - (v / max) * (H - 2)).toFixed(1)}`)
    .join(' ')
})
</script>

{#if points}
  <svg width={W} height={H} viewBox="0 0 {W} {H}" role="img" aria-label={label}>
    <polyline {points} />
  </svg>
{/if}

<style>
  svg {
    flex: none;
    vertical-align: middle;
  }

  polyline {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 1.25;
    stroke-linejoin: round;
  }
</style>
