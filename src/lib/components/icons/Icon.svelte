<script lang="ts">
import { type IconName, icons } from './paths'

interface Props {
  name: IconName
  size?: number
  /** Decorative by default; pass a label to expose the icon to assistive tech. */
  label?: string
}

const { name, size = 16, label }: Props = $props()
const shapes = $derived(icons[name])
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden={label ? undefined : 'true'}
  aria-label={label}
  role={label ? 'img' : undefined}
>
  {#each shapes as shape, i (i)}
    {#if shape.t === 'path'}
      <path d={shape.d} />
    {:else if shape.t === 'circle'}
      <circle cx={shape.cx} cy={shape.cy} r={shape.r} />
    {:else if shape.t === 'line'}
      <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} />
    {:else}
      <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} />
    {/if}
  {/each}
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
