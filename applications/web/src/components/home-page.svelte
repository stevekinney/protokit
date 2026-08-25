<script lang="ts">
	import Button from '@lostgradient/cinder/button';
	import Card from '@lostgradient/cinder/card';
	import CopyButton from '@lostgradient/cinder/copy-button';
	import type { HomePageProps } from '@web/components/home-page.types';

	let {
		user,
		baseUrl,
		signOutCsrfToken,
		connections = [],
		connectionsCsrfToken,
	}: HomePageProps = $props();

	// `$derived`, not plain `const`: these read a prop, and a plain const would
	// capture only its initial value and go stale if the prop ever changed.
	const mcpEndpoint = $derived(`${baseUrl}/mcp`);
	const metadataEndpoint = $derived(`${baseUrl}/.well-known/oauth-authorization-server`);
</script>

<main class="page stack">
	<div class="stack-tight">
		<p class="eyebrow">Protokit</p>
		<h1>MCP OAuth Server</h1>
		<p class="muted">Bun-native Svelte server with OAuth, MCP transport, and Google sign-in.</p>
	</div>

	{#if user}
		<Card variant="well" title="Signed in as" headingLevel={2}>
			<div class="stack-tight">
				<p>{user.email}</p>
				<div class="row">
					<!--
						Review round 4 / P2: a "Review OAuth Request" link to a bare
						`/oauth/authorize` (no `client_id`, `redirect_uri`,
						`response_type`, PKCE, or `resource`) always rendered that
						route's invalid-parameters error -- OAuth consent can only be
						initiated by a client carrying those parameters, never by the
						resource server itself. Removed rather than replaced: nothing on
						this page can supply a valid, configured authorization request,
						and the "Connected Applications" section below already covers
						reviewing and revoking existing grants.
					-->
					<form method="POST" action="/auth/sign-out">
						{#if signOutCsrfToken}
							<input type="hidden" name="csrf_token" value={signOutCsrfToken} />
						{/if}
						<Button type="submit" variant="secondary">Sign Out</Button>
					</form>
				</div>
			</div>
		</Card>
	{:else}
		<Card variant="well">
			<div class="stack-tight">
				<p>Sign in with Google to authorize OAuth clients.</p>
				<div class="row">
					<Button href="/auth/google/start?callback_path=/" variant="primary">
						Continue With Google
					</Button>
				</div>
			</div>
		</Card>
	{/if}

	{#if user && connections.length > 0}
		<Card title="Connected Applications" headingLevel={2}>
			{#snippet footer()}
				<form method="POST" action="/account/connections/revoke-all">
					{#if connectionsCsrfToken}
						<input type="hidden" name="csrf_token" value={connectionsCsrfToken} />
					{/if}
					<Button type="submit" variant="soft-danger" size="sm">Revoke All</Button>
				</form>
			{/snippet}
			<ul class="connection-list">
				{#each connections as connection (connection.clientId)}
					<li>
						<span>{connection.clientName}</span>
						<form method="POST" action="/account/connections/revoke">
							{#if connectionsCsrfToken}
								<input type="hidden" name="csrf_token" value={connectionsCsrfToken} />
							{/if}
							<input type="hidden" name="client_id" value={connection.clientId} />
							<Button type="submit" variant="ghost-danger" size="sm">Revoke</Button>
						</form>
					</li>
				{/each}
			</ul>
		</Card>
	{/if}

	<Card title="Endpoints" headingLevel={2}>
		<div class="stack">
			<div>
				<div class="row">
					<strong>MCP Endpoint</strong>
					<CopyButton
						value={mcpEndpoint}
						label="Copy MCP endpoint"
						copiedLabel="MCP endpoint copied"
					/>
				</div>
				<code class="endpoint">{mcpEndpoint}</code>
			</div>
			<div>
				<strong>Authorization Metadata</strong>
				<code class="endpoint">{metadataEndpoint}</code>
			</div>
		</div>
	</Card>
</main>
