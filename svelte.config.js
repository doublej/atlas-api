import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // adapter-node: the launchd daemon serves the built output, not `vite dev`.
    // A dev server needs ~70s of on-demand compilation before its first response,
    // which the health checks read as "dead" and SIGKILL. See atlas-api/CLAUDE.md.
    adapter: adapter(),
    alias: {
      $shared: '../shared',
    },
  },
}

export default config
