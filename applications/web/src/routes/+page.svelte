<script lang="ts">
	import { authenticationClient } from '$lib/authentication-client';

	const session = authenticationClient.useSession();

	function signIn() {
		authenticationClient.signIn.social({ provider: 'google' });
	}

	function signOut() {
		authenticationClient.signOut();
	}
</script>

<svelte:head>
	<title>MCP Server</title>
</svelte:head>

<main>
	<h1>MCP Server Template</h1>

	{#if $session.data}
		<div class="authenticated">
			<p>Signed in as <strong>{$session.data.user.email}</strong></p>
			<button onclick={signOut}>Sign Out</button>
		</div>
	{:else}
		<div class="unauthenticated">
			<p>Sign in to manage your MCP server.</p>
			<button onclick={signIn}>Sign in with Google</button>
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

	button {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 0.375rem;
		font-size: 1rem;
		cursor: pointer;
		background: #2563eb;
		color: white;
	}

	button:hover {
		background: #1d4ed8;
	}
</style>
