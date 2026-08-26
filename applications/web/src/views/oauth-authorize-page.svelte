<script lang="ts">
	import Alert from '@lostgradient/cinder/alert';
	import Button from '@lostgradient/cinder/button';
	import Card from '@lostgradient/cinder/card';
	import type { OAuthAuthorizePageInput } from '@web/views/oauth-authorize-page.types';

	let input: OAuthAuthorizePageInput = $props();

	function hostOf(redirectUri: string): string {
		try {
			return new URL(redirectUri).host;
		} catch {
			return redirectUri;
		}
	}
</script>

<main class="page">
	{#if input.mode === 'error'}
		<Alert variant="danger">
			<div class="stack-tight">
				<h1>Authorization Error</h1>
				<p>{input.error}</p>
				<p><a href="/">Back to home</a></p>
			</div>
		</Alert>
	{:else}
		<div class="stack-tight">
			<p class="eyebrow">OAuth Consent</p>
			<!--
				The page heading lives here rather than in Card's `title`: Cinder
				caps a generated card title at `h2` so a card never invents the
				document's top-level heading, and a consent screen genuinely needs
				an `h1`.
			-->
			<h1>Authorize {input.clientName}</h1>
		</div>

		<Card>
			<div class="stack">
				<div class="stack-tight">
					<p>
						{input.clientName} is requesting access as <strong>{input.user.email}</strong>.
					</p>
					<p class="muted">
						You will be redirected to <strong>{hostOf(input.redirectUri)}</strong> after you decide.
					</p>
				</div>

				<Card variant="well">
					<div class="stack-tight">
						<p><strong>This will allow {input.clientName} to:</strong></p>
						<ul>
							{#each input.scopes as scope (scope.scope)}
								<li>{scope.description}</li>
							{/each}
						</ul>
					</div>
				</Card>
			</div>

			{#snippet footer()}
				<div class="row">
					<form method="POST" action="/oauth/authorize/approve" class="inline-form">
						<input type="hidden" name="transaction_id" value={input.transactionId} />
						<input type="hidden" name="csrf_token" value={input.csrfToken} />
						<Button type="submit" variant="primary" size="lg">Approve</Button>
					</form>

					<form method="POST" action="/oauth/authorize/deny" class="inline-form">
						<input type="hidden" name="transaction_id" value={input.transactionId} />
						<input type="hidden" name="csrf_token" value={input.csrfToken} />
						<Button type="submit" variant="secondary" size="lg">Deny</Button>
					</form>
				</div>
			{/snippet}
		</Card>
	{/if}
</main>
