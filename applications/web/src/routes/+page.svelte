<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>MCP Server</title>
</svelte:head>

<main>
	<h1>MCP Server Template</h1>

	{#if data.user}
		<div class="authenticated">
			<p>Signed in as <strong>{data.user.email}</strong></p>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- Better Auth route, not a SvelteKit route -->
			<a href="/api/auth/sign-out">Sign Out</a>
		</div>
	{:else}
		<div class="unauthenticated">
			<p>Sign in to manage your MCP server.</p>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- custom sign-in endpoint with query params -->
			<a href="/sign-in?provider=google">Sign in with Google</a>
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 480px;
		margin: 4rem auto;
		padding: 2rem;
		font-family: system-ui, sans-serif;
		text-align: center;
	}

	a {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 0.375rem;
		font-size: 1rem;
		cursor: pointer;
		background: #2563eb;
		color: white;
		text-decoration: none;
	}

	a:hover {
		background: #1d4ed8;
	}
</style>
