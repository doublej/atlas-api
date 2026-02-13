<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
</svelte:head>

{@render children()}

<style>
	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		font-family: 'IBM Plex Sans', system-ui, sans-serif;
		background: #0a0a0b;
		color: #e4e4e7;
		line-height: 1.5;
		-webkit-font-smoothing: antialiased;
	}

	:global(code), :global(pre), :global(.mono) {
		font-family: 'IBM Plex Mono', monospace;
	}
</style>
