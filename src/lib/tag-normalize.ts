// Pure, so the browser's tag input normalises exactly as the API stores.

/** Lowercase kebab, deduped, sorted — so `Client PSP` and `client-psp` are one tag. */
export function normalizeTags(tags: string[]): string[] {
  const clean = tags
    .map((t) =>
      t
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
  return [...new Set(clean)].sort()
}
