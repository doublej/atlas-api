import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [sveltekit()],
  // Vite 8 binds IPv6-only for the default host; pin IPv4 loopback so every
  // consumer reaching 127.0.0.1 (Chrome, Raycast, picker) keeps connecting.
  server: { port: 47891, host: '127.0.0.1' },
  preview: { port: 47891, host: '127.0.0.1' },
})
