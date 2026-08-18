<script lang="ts">
import '$lib/styles/tokens.css'
import { onMount } from 'svelte'
import { page } from '$app/state'
import favicon from '$lib/assets/favicon.svg'
import Nav from '$lib/components/Nav.svelte'
import { initTheme } from '$lib/theme.svelte'

let { children } = $props()

onMount(initTheme)

// claude-tree is a fixed 100vh canvas (SvelteFlow) — a nav band above it would
// push its layout past the viewport, so it opts out rather than the page
// being restructured to account for shared chrome.
const showNav = $derived(!page.url.pathname.startsWith('/claude-tree'))
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&family=Instrument+Serif:ital@0;1&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#if showNav}
	<Nav />
{/if}
{@render children()}
