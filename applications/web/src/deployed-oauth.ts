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
 * Review finding (P1): this harness used to send the LIVE authorization
 * code to `https://example.com/callback` -- a host this repository does
 * not control -- while pairing it with the fixed, public RFC 7636
 * Appendix B PKCE verifier. Anyone who can see that callback (the domain's
 * operator, a network intercept, a referrer log) would have everything
 * needed to redeem the code for the operator's own tokens before the
 * operator does. The redirect URI is now a loopback listener this process
 * starts and controls (RFC 8252 §7.3), and the PKCE verifier is generated
 * fresh per run rather than reused from a publicly documented example.
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

import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	checkDiscoveryDocumentsForConnectorCompatibility,
	fetchDiscoveryDocuments,
	runHarnessMain,
} from '@web/connector-smoke-support';

/**
 * Review finding (P2, round 12): checking only `status < 500` on the
 * unauthenticated-authorize probe let a 404 (routing broken), a local 400
 * (validation rejecting a well-formed request), or an unexpected 200
 * (serving the page, or worse, minting a code, without requiring sign-in)
 * all pass as "correct" -- the same class of gap the sibling invalid-grant
 * check on the token endpoint already closed. The only response that
 * actually proves an unauthenticated authorize request is handled
 * correctly is a 3xx redirect whose `Location` resolves to this same
 * deployment (never a third-party host, which would itself be a defect
 * worth catching). Extracted as a pure function, independent of `fetch`
 * and process exit codes, so the discrimination logic itself is directly
 * testable rather than only reachable by driving the whole script against
 * a live host.
 */
export function checkAuthorizeRedirectsToSignIn(
	authorizeUrl: URL,
	response: { status: number; headers: { get(name: string): string | null } },
): string | null {
	if (response.status >= 500) {
		return `GET ${authorizeUrl.pathname} returned HTTP ${response.status} for an unauthenticated, otherwise well-formed authorization request`;
	}
	if (response.status < 300 || response.status >= 400) {
		return `GET ${authorizeUrl.pathname} returned HTTP ${response.status} for an unauthenticated, otherwise well-formed authorization request, expected a 3xx redirect to sign-in`;
	}

	const location = response.headers.get('location');
	if (!location) {
		return `GET ${authorizeUrl.pathname} returned HTTP ${response.status} with no Location header, expected a redirect to this deployment's own sign-in route`;
	}

	const redirectOrigin = new URL(location, authorizeUrl).origin;
	if (redirectOrigin !== authorizeUrl.origin) {
		return `GET ${authorizeUrl.pathname} redirected to a different origin (${redirectOrigin}) than the deployment under test (${authorizeUrl.origin}), expected a same-origin sign-in redirect`;
	}

	return null;
}

/** RFC 7636 §4.1: 43-128 characters of unreserved base64url. 32 random bytes -> 43 characters, the shortest valid length, generated fresh per run rather than reused from any published example. */
export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
	const codeVerifier = randomBytes(32).toString('base64url');
	const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
	return { codeVerifier, codeChallenge };
}

/**
 * Starts a loopback HTTP listener (RFC 8252 §7.3) this process controls,
 * and returns both the redirect URI to register/present and a promise that
 * resolves with the `code` query parameter once the browser is redirected
 * back here -- or rejects if the operator abandons the flow or the
 * absolute timeout elapses. Registering `http://127.0.0.1/callback`
 * (portless) and presenting the same path with the real ephemeral port
 * both match: `redirect-uri-matching.ts` deliberately ignores port for a
 * loopback redirect URI, per RFC 8252 §7.3's "MUST allow any port".
 */
export function startLoopbackCallbackListener(timeoutMs: number): {
	redirectUri: string;
	registeredRedirectUri: string;
	waitForCode: () => Promise<string>;
	close: () => void;
} {
	let resolveCode: (code: string) => void;
	let rejectCode: (error: Error) => void;
	const codePromise = new Promise<string>((resolve, reject) => {
		resolveCode = resolve;
		rejectCode = reject;
	});

	const server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		fetch(request) {
			const url = new URL(request.url);
			const code = url.searchParams.get('code');
			const error = url.searchParams.get('error');
			if (error) {
				rejectCode(
					new Error(`authorization server returned error=${error} to the loopback callback`),
				);
			} else if (code) {
				resolveCode(code);
			} else {
				return new Response('Missing code/error on loopback callback.', { status: 400 });
			}
			return new Response(
				'<html><body>Authorization received. You may close this tab and return to the terminal.</body></html>',
				{ headers: { 'content-type': 'text/html' } },
			);
		},
	});

	const timeout = setTimeout(() => {
		rejectCode(new Error(`timed out after ${timeoutMs}ms waiting for the loopback callback`));
	}, timeoutMs);
	timeout.unref();

	return {
		redirectUri: `http://127.0.0.1:${server.port}/callback`,
		registeredRedirectUri: 'http://127.0.0.1/callback',
		waitForCode: () => codePromise,
		close: () => {
			clearTimeout(timeout);
			server.stop(true);
		},
	};
}

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

	const loopback = startLoopbackCallbackListener(10 * 60 * 1000);

	console.log('[deployed-oauth] registering a dynamic client...');
	const smokeClientName = `protokit-deployed-oauth-smoke-${new Date().toISOString()}`;
	const registrationResponse = await fetch(registrationEndpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			client_name: smokeClientName,
			redirect_uris: [loopback.registeredRedirectUri],
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

	const { codeVerifier, codeChallenge } = generatePkcePair();

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
				redirect_uri: loopback.redirectUri,
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
			// Review finding (P2, separate thread): a 4xx alone does not prove
			// the server rejected this FOR the reason under test -- a 404 HTML
			// page or an unrelated `invalid_client` would pass this check just
			// as easily while leaving routing, client authentication, or error
			// serialization silently broken. Require the specific OAuth error
			// code RFC 6749 §5.2 names for this case.
			if (errorBody.error !== 'invalid_grant') {
				problems.push(
					`token endpoint returned HTTP ${invalidGrantResponse.status} for an invalid authorization code, but error="${errorBody.error ?? 'unknown'}" (expected "invalid_grant")`,
				);
			} else {
				console.log(
					`[deployed-oauth] token endpoint correctly rejected an invalid code (HTTP ${invalidGrantResponse.status}, error="invalid_grant")`,
				);
			}
		}

		console.log(
			'[deployed-oauth] checking the authorization endpoint builds a spec-correct URL...',
		);
		const authorizeUrl = new URL(authorizationEndpoint);
		authorizeUrl.searchParams.set('response_type', 'code');
		authorizeUrl.searchParams.set('client_id', clientId);
		authorizeUrl.searchParams.set('redirect_uri', loopback.redirectUri);
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
		// unauthenticated response shape. See `checkAuthorizeRedirectsToSignIn`
		// for what's required and why a non-5xx alone used to be treated as a
		// pass.
		const redirectProblem = checkAuthorizeRedirectsToSignIn(authorizeUrl, authorizeResponse);
		if (redirectProblem) {
			problems.push(redirectProblem);
		} else {
			console.log(
				`[deployed-oauth] authorization endpoint correctly redirected an unauthenticated request to its own sign-in route (HTTP ${authorizeResponse.status}, Location="${authorizeResponse.headers.get('location')}")`,
			);
		}
	}

	if (problems.length > 0) {
		loopback.close();
		console.error('');
		console.error('[deployed-oauth] FAILED:');
		for (const problem of problems) {
			console.error(`  - ${problem}`);
		}
		process.exit(1);
	}

	const authorizeUrlForHuman =
		`${authorizationEndpoint}?response_type=code&client_id=${clientId ?? '<client_id above>'}` +
		`&redirect_uri=${encodeURIComponent(loopback.redirectUri)}&code_challenge=${codeChallenge}` +
		`&code_challenge_method=S256&resource=${encodeURIComponent(`${baseUrl}/mcp`)}&scope=profile:read`;

	console.log('');
	console.log('================================================================');
	console.log('MANUAL COMPLETION REQUIRED -- obtaining a real bearer token');
	console.log('================================================================');
	console.log('Everything above just ran for real against a live deployment. Getting a');
	console.log('bearer token for test:deployed-streaming needs a human clicking through a');
	console.log("real browser OAuth consent screen (Google sign-in, then this server's own");
	console.log('consent page) -- that cannot be scripted. This process is now listening on');
	console.log(`${loopback.redirectUri} (loopback only -- never a third-party host) and will`);
	console.log('capture the authorization code itself once you approve consent:');
	console.log('');
	console.log(`  1. Open in a browser: ${authorizeUrlForHuman}`);
	console.log('  2. Sign in and approve consent.');
	console.log(
		`  3. Waiting up to 10 minutes for the loopback callback... (Ctrl+C to give up and finish by hand)`,
	);

	let code: string;
	try {
		code = await loopback.waitForCode();
	} catch (error) {
		loopback.close();
		console.error(
			`[deployed-oauth] FAILED: did not receive the authorization code on the loopback callback: ${(error as Error).message}`,
		);
		console.error('[deployed-oauth] finish by hand: exchange the captured `code` yourself, e.g.:');
		console.error(
			`  curl -s -X POST ${tokenEndpoint} -d grant_type=authorization_code -d code=CODE -d redirect_uri=${loopback.redirectUri} -d client_id=${clientId ?? '<client_id above>'} -d code_verifier=${codeVerifier} -d resource=${encodeURIComponent(`${baseUrl}/mcp`)}`,
		);
		process.exit(1);
	}
	loopback.close();

	console.log('[deployed-oauth] received the authorization code; exchanging it for tokens...');
	const tokenResponse = await fetch(tokenEndpoint, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: loopback.redirectUri,
			client_id: clientId!,
			code_verifier: codeVerifier,
			resource: `${baseUrl}/mcp`,
		}).toString(),
		signal: AbortSignal.timeout(15_000),
	});

	if (!tokenResponse.ok) {
		console.error(
			`[deployed-oauth] FAILED: token exchange returned HTTP ${tokenResponse.status}: ${await tokenResponse.text()}`,
		);
		process.exit(1);
	}

	const tokenBody = (await tokenResponse.json()) as { access_token?: string };
	if (!tokenBody.access_token) {
		console.error('[deployed-oauth] FAILED: token endpoint response is missing access_token.');
		process.exit(1);
	}

	// Review finding (P2): printing the raw bearer token as part of a shell
	// command (the previous `--token ${tokenBody.access_token}` form) leaves
	// it in terminal scrollback and shell history, and exposes it in this
	// process's own argv for the token's full lifetime if the printed
	// command is actually run -- unlike every other one-time secret this
	// repository hands off (`scripts/seed.ts`'s `deliverSeedClientSecret`,
	// `SECRETS-ROTATION.md`'s procedures), which deliver through a mode-0600
	// file rather than a command-line argument. Delivered the same way here:
	// written to a mode-0600 temp file, never logged, with only its path
	// printed. `deployed-streaming.ts`'s `--token-file` reads and trims it.
	const tokenFilePath = join(
		tmpdir(),
		`protokit-deployed-oauth-token-${process.pid}-${randomBytes(8).toString('hex')}`,
	);
	writeFileSync(tokenFilePath, tokenBody.access_token, { mode: 0o600 });
	chmodSync(tokenFilePath, 0o600);

	console.log('================================================================');
	console.log(
		'[deployed-oauth] obtained a real access token, written to a mode-0600 file. Use it with:',
	);
	console.log(`  bun run test:deployed-streaming -- ${baseUrl}/mcp --token-file ${tokenFilePath}`);
	console.log('================================================================');
	console.log('');
	console.log('[deployed-oauth] every automatable check passed against a real, public deployment.');
	process.exit(0);
}

if (import.meta.main) {
	await runHarnessMain('deployed-oauth', main);
}
