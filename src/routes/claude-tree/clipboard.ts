// Copy actions of the node menu and the agent panel: the text they build and the copy itself.

import type { TreeNode } from '$lib/claude-tree'
import { errorMessage } from '$lib/format'
import { http } from '$lib/http'
import { toast } from '$lib/toast.svelte'

/** One file of a "copy with ancestors" bundle. */
export interface CopyPart {
  label: string
  path: string
  content: string
}

/** Each file under a `# ===== label =====` + path banner, root first, three blank lines apart. */
export function ancestorsText(parts: CopyPart[]): string {
  return parts.map((p) => `# ===== ${p.label} =====\n# ${p.path}\n\n${p.content}`).join('\n\n\n')
}

/** `Copied web + 2 ancestors` */
export function ancestorsLabel(label: string, ancestors: number): string {
  return `Copied ${label} + ${ancestors} ancestor${ancestors === 1 ? '' : 's'}`
}

/** Write to the clipboard and say so (or why not) in a toast. */
export async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast(label)
  } catch (e) {
    toast(`copy failed: ${errorMessage(e)}`, 'error')
  }
}

const read = async (n: TreeNode) =>
  (await http.get<{ content: string }>(`/api/claude-tree?path=${encodeURIComponent(n.path)}`))
    .content

/**
 * Copy `node`'s file — or, given its ancestor chain (root first, ending at `node`), every
 * file of the chain under its banner.
 */
export async function copyFiles(node: TreeNode, chain: TreeNode[] | null): Promise<void> {
  try {
    if (!chain) return await copyText(await read(node), `Copied ${node.label}`)
    const parts = await Promise.all(
      chain.map(async (n) => ({ label: n.label, path: n.path, content: await read(n) })),
    )
    await copyText(ancestorsText(parts), ancestorsLabel(node.label, chain.length - 1))
  } catch (e) {
    toast(`copy failed: ${errorMessage(e)}`, 'error')
  }
}
