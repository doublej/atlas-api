<script lang="ts">
import '$lib/styles/tokens.css'
import { onMount } from 'svelte'
import favicon from '$lib/assets/favicon.svg'
import Nav from '$lib/components/Nav.svelte'
import { initTheme } from '$lib/theme.svelte'

let { children } = $props()

onMount(initTheme)
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

<Nav />
{@render children()}
