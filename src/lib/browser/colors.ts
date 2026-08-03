// Categorical identity colours for project types and frameworks. These are the
// one place raw hex survives the token system: they encode ecosystem identity
// (Svelte orange, Go cyan), which no semantic token can express. They are only
// ever painted as small dots next to neutral text, so contrast never depends on
// them in either theme.

export const typeColors: Record<string, string> = {
  node: '#4ade80',
  python: '#60a5fa',
  swift: '#fb923c',
  rust: '#fbbf24',
  go: '#22d3ee',
  folder: '#71717a',
}

export const frameworkColors: Record<string, string> = {
  sveltekit: '#ff3e00',
  svelte: '#ff3e00',
  next: '#a1a1aa',
  nuxt: '#4ade80',
  astro: '#c084fc',
  remix: '#a1a1aa',
  react: '#38bdf8',
  vue: '#4ade80',
  angular: '#f87171',
  vite: '#a78bfa',
  express: '#71717a',
  fastify: '#71717a',
  hono: '#fb923c',
  elysia: '#a78bfa',
  vapor: '#a78bfa',
  fastapi: '#2dd4bf',
  flask: '#71717a',
  django: '#4ade80',
  streamlit: '#f87171',
  tauri: '#fbbf24',
  electron: '#38bdf8',
  unknown: '#52525b',
}

const FALLBACK = '#71717a'

export const typeColor = (type: string | undefined): string =>
  typeColors[type ?? 'folder'] ?? FALLBACK

export const frameworkColor = (framework: string): string => frameworkColors[framework] ?? FALLBACK
