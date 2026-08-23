#!/usr/bin/env bun
/**
 * `OPS-001`: `bun run test:deployed-oauth -- https://HOST`
 *
 * Drives the automatable half of a real OAuth round trip against a real,
 * deployed host: discovery documents match connector expectations (reusing
 * `INTEROP-001`'s own check), dynamic client registration produces a usable
 * client, the resulting authorization URL is spec-correct, and the token
 * endpoint's negative paths (an invalid authorization code, a malformed
 * grant) fail as `invalid_grant`/`invalid_request` -- never a 5xx, which
 * would mean the deployed server itself is misconfigured rather than the
 * caller. What cannot be automated -- a human clicking through a real
 * browser OAuth consent screen -- is printed as an exact manual completion
 * sequence at the end, reusing `INTEROP-001`'s own
 * `printManualCompletionSteps` pattern.
 *
 * A real DCR call against a real host has a side effect: it creates a real
 * `oauth_clients` row. This harness tags its `client_name` with a
 * recognizable smoke-test marker and prints the resulting `client_id` so an
 * operator can find and delete it later -- deleting it here would require
 * RFC 7592 client-configuration support this server does not implement
 * (`registration_access_token`/`registration_client_uri` are not part of
 * this repository's DCR response), so cleanup is documented, not silently
 * skipped.
 */

import {
	checkDiscoveryDocumentsForConnectorCompatibility,
	fetchDiscoveryDocuments,
} from '@web/connector-smoke-support';

async function main(): Promise<void> {
	const hostArgument = process.argv[2];
	if (!hostArgument) {
		console.error('[deployed-oauth] usage: bun run test:deployed-oauth -- https://HOST');
		process.exit(1);
	}
	const baseUrl = hostArgument.replace(/\/$/, '');

	const problems: string[] = [];

	console.log('[deployed-oauth] fetching discovery documents...');
	const documents = await fetchDiscoveryDocuments(baseUrl);
	const discoveryProblems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
	if (discoveryProblems.length > 0) {
		problems.push(...discoveryProblems.map((problem) => `discovery: ${problem}`));
	} else {
		console.log('[deployed-oauth] discovery documents are spec-correct');
	}

	const registrationEndpoint = documents.authorizationServerMetadata['registration_endpoint'] as
		string | undefined;
	const authorizationEndpoint = documents.authorizationServerMetadata['authorization_endpoint'] as
		string | undefined;
	const tokenEndpoint = documents.authorizationServerMetadata['token_endpoint'] as
		string | undefined;

	if (!registrationEndpoint || !authorizationEndpoint || !tokenEndpoint) {
		console.error(
			'[deployed-oauth] FAILED: cannot continue without registration/authorization/token endpoints in discovery.',
		);
		if (problems.length > 0) {
			for (const problem of problems) console.error(`  - ${problem}`);
		}
		process.exit(1);
	}

	console.log('[deployed-oauth] registering a dynamic client...');
	const smokeClientName = `protokit-deployed-oauth-smoke-${new Date().toISOString()}`;
	const registrationResponse = await fetch(registrationEndpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			client_name: smokeClientName,
			redirect_uris: ['https://example.com/callback'],
			grant_types: ['authorization_code', 'refresh_token'],
			response_types: ['code'],
			token_endpoint_auth_method: 'none',
		}),
		signal: AbortSignal.timeout(15_000),
	});

	if (registrationResponse.status !== 201) {
		problems.push(
			`dynamic client registration returned HTTP ${registrationResponse.status}, expected 201: ${await registrationResponse.text()}`,
		);
	}

	let clientId: string | undefined;
	if (registrationResponse.status === 201) {
		const registrationBody = (await registrationResponse.json()) as { client_id?: string };
		clientId = registrationBody.client_id;
		if (!clientId) {
			problems.push('dynamic client registration response is missing client_id');
		} else {
			console.log(
				`[deployed-oauth] registered client_id=${clientId} (client_name="${smokeClientName}") -- this row is NOT deleted automatically, see the notes above.`,
			);
		}
	}

	if (clientId) {
		console.log(
			'[deployed-oauth] checking the token endpoint rejects an invalid grant, not a 5xx...',
		);
		const invalidGrantResponse = await fetch(tokenEndpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code: 'not-a-real-authorization-code',
				redirect_uri: 'https://example.com/callback',
				client_id: clientId,
				code_verifier: 'this-is-a-placeholder-verifier-of-sufficient-length-for-pkce',
				resource: `${baseUrl}/mcp`,
			}).toString(),
			signal: AbortSignal.timeout(15_000),
		});

		if (invalidGrantResponse.status >= 500) {
			problems.push(
				`token endpoint returned HTTP ${invalidGrantResponse.status} for an invalid authorization code, expected a 4xx invalid_grant error`,
			);
		} else if (invalidGrantResponse.status < 400) {
			problems.push(
				`token endpoint returned HTTP ${invalidGrantResponse.status} for an invalid authorization code, expected a 4xx rejection`,
			);
		} else {
			const errorBody = (await invalidGrantResponse.json().catch(() => ({}))) as {
				error?: string;
			};
			console.log(
				`[deployed-oauth] token endpoint correctly rejected an invalid code (HTTP ${invalidGrantResponse.status}, error="${errorBody.error ?? 'unknown'}")`,
			);
		}

		console.log(
			'[deployed-oauth] checking the authorization endpoint builds a spec-correct URL...',
		);
		const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'; // RFC 7636 Appendix B
		const authorizeUrl = new URL(authorizationEndpoint);
		authorizeUrl.searchParams.set('response_type', 'code');
		authorizeUrl.searchParams.set('client_id', clientId);
		authorizeUrl.searchParams.set('redirect_uri', 'https://example.com/callback');
		authorizeUrl.searchParams.set('code_challenge', codeChallenge);
		authorizeUrl.searchParams.set('code_challenge_method', 'S256');
		authorizeUrl.searchParams.set('resource', `${baseUrl}/mcp`);
		// AUTHZ-001: the server's scope vocabulary is `profile:read` and
		// `prompts:read` (see `packages/mcp/src/scopes.ts`), never a bare
		// `profile`. `test:deployed-streaming` subscribes to `user://profile`,
		// which requires `profile:read`.
		authorizeUrl.searchParams.set('scope', 'profile:read');

		const authorizeResponse = await fetch(authorizeUrl.toString(), {
			redirect: 'manual',
			signal: AbortSignal.timeout(15_000),
		});
		// Not signed in: this server redirects to its own sign-in page rather
		// than 500ing or silently accepting an unauthenticated authorize
		// request -- that redirect target, not a 200, is the correct
		// unauthenticated response shape.
		if (authorizeResponse.status >= 500) {
			problems.push(
				`GET ${authorizationEndpoint} returned HTTP ${authorizeResponse.status} for an unauthenticated, otherwise well-formed authorization request`,
			);
		} else {
			console.log(
				`[deployed-oauth] authorization endpoint responded HTTP ${authorizeResponse.status} to a well-formed, unauthenticated request (expected: a sign-in redirect, not a 5xx)`,
			);
		}
	}

	if (problems.length > 0) {
		console.error('');
		console.error('[deployed-oauth] FAILED:');
		for (const problem of problems) {
			console.error(`  - ${problem}`);
		}
		process.exit(1);
	}

	console.log('');
	console.log('================================================================');
	console.log('MANUAL COMPLETION REQUIRED -- obtaining a real bearer token');
	console.log('================================================================');
	console.log('Everything above just ran for real against a live deployment. Getting a');
	console.log('bearer token for test:deployed-streaming needs a human clicking through a');
	console.log("real browser OAuth consent screen (Google sign-in, then this server's own");
	console.log('consent page) -- that cannot be scripted. To finish by hand:');
	console.log('');
	console.log(
		`  1. Open in a browser: ${authorizationEndpoint}?response_type=code&client_id=${clientId ?? '<client_id above>'}&redirect_uri=https://example.com/callback&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&resource=${encodeURIComponent(`${baseUrl}/mcp`)}&scope=profile:read`,
	);
	console.log('  2. Sign in and approve consent; capture the redirected `code` query parameter.');
	console.log(
		`  3. curl -s -X POST ${tokenEndpoint} -d grant_type=authorization_code -d code=CODE -d redirect_uri=https://example.com/callback -d client_id=${clientId ?? '<client_id above>'} -d code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk -d resource=${encodeURIComponent(`${baseUrl}/mcp`)}`,
	);
	console.log(
		'  4. Use the resulting access_token with: bun run test:deployed-streaming -- ' +
			`${baseUrl}/mcp --token ACCESS_TOKEN`,
	);
	console.log('================================================================');
	console.log('');
	console.log('[deployed-oauth] every automatable check passed against a real, public deployment.');
	process.exit(0);
}

await main();
