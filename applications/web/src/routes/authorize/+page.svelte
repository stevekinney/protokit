<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Authorize Application</title>
</svelte:head>

<main>
	{#if data.error}
		<div class="error">
			<h1>Authorization Error</h1>
			<p>{data.error}</p>
		</div>
	{:else}
		<div class="authorize">
			<h1>Authorize {data.clientName}</h1>
			<p>
				<strong>{data.clientName}</strong> wants to access your account as
				<strong>{data.user?.email || data.user?.name || 'Unknown'}</strong>.
			</p>

			{#if data.scope}
				<p>Requested scopes: <code>{data.scope}</code></p>
			{/if}

			<div class="actions">
				<form method="POST" action="?/approve">
					<input type="hidden" name="client_id" value={data.clientId} />
					<input type="hidden" name="redirect_uri" value={data.redirectUri} />
					<input type="hidden" name="code_challenge" value={data.codeChallenge} />
					<input type="hidden" name="code_challenge_method" value={data.codeChallengeMethod} />
					<input type="hidden" name="state" value={data.state || ''} />
					<input type="hidden" name="scope" value={data.scope} />
					<button type="submit" class="approve">Approve</button>
				</form>

				<form method="POST" action="?/deny">
					<input type="hidden" name="client_id" value={data.clientId} />
					<input type="hidden" name="redirect_uri" value={data.redirectUri} />
					<input type="hidden" name="state" value={data.state || ''} />
					<button type="submit" class="deny">Deny</button>
				</form>
			</div>
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 480px;
		margin: 4rem auto;
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}

	.error {
		color: #dc2626;
	}

	.actions {
		display: flex;
		gap: 1rem;
		margin-top: 2rem;
	}

	button {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 0.375rem;
		font-size: 1rem;
		cursor: pointer;
	}

	.approve {
		background: #2563eb;
		color: white;
	}

	.approve:hover {
		background: #1d4ed8;
	}

	.deny {
		background: #e5e7eb;
		color: #374151;
	}

	.deny:hover {
		background: #d1d5db;
	}
</style>
