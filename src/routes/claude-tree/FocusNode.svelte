<script lang="ts">
import { useSvelteFlow } from '@xyflow/svelte'

// Center the just-selected node — simple and predictable: pan (keeping zoom) so the
// clicked node sits in the middle of the graph pane. Waits a couple of frames so the
// editor-pane resize and node measurement have settled before centering.
let { focusId }: { focusId: string | null } = $props()
const { getInternalNode, setCenter, getViewport } = useSvelteFlow()

$effect(() => {
  const id = focusId
  if (!id) return
  const t = setTimeout(() => {
    const n = getInternalNode(id)
    if (!n) return
    const { x, y } = n.internals.positionAbsolute
    const w = n.measured?.width ?? 240
    const h = n.measured?.height ?? 80
    void setCenter(x + w / 2, y + h / 2, { zoom: getViewport().zoom, duration: 350 })
  }, 80)
  return () => clearTimeout(t)
})
</script>
