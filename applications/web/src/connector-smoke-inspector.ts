#!/usr/bin/env bun
/**
 * `DIST-001`: a ready-to-run MCP Inspector smoke harness.
 *
 * Anthropic's pre-submission checklist requires exercising every tool
 * through the MCP Inspector before submitting to the Claude connector
 * directory ("For MCP servers, exercise every tool through the MCP
 * Inspector and as a custom connector in Claude" --
 * https://claude.com/docs/connectors/building/review-criteria). The
 * "custom connector in Claude" half needs a live public host and a human
 * browser login (see `CONNECTORS.md`'s Claude hosted section) and cannot
 * be automated here. This script automates as much of the Inspector half
 * as is genuinely reliable, and is explicit about the one piece it found
 * is not.
 *
 * Usage:
 *   bun run test:connector:inspector                          # self-hosts this server locally
 *   bun run test:connector:inspector -- --host https://HOST   # points at a real deployment
 *
 * What this script proves, for real, against a real running instance of
 * this server:
 *
 *  1. The pinned, lockfile-resolved `@modelcontextprotocol/inspector` CLI
 *     (`bunx --bun @modelcontextprotocol/inspector --cli`), run
 *     unauthenticated against `/mcp`, correctly detects that this server
 *     requires OAuth and refuses to proceed -- the same behavior a real
 *     Inspector session exhibits before a human completes the browser
 *     consent screen.
 *  2. The exact same wire protocol the Inspector CLI speaks (Streamable
 *     HTTP, `@modelcontextprotocol/client`'s `StreamableHTTPClientTransport`
 *     -- the library both the Inspector and this repository's own
 *     integration tests are built on) lists `get_user_profile` with its
 *     `readOnlyHint` annotation intact and successfully calls it, once
 *     authenticated with a real, resource-bound bearer token obtained
 *     through this server's real authorize -> approve -> token chain (the
 *     same helper shape `oauth-mcp-resource-binding.integration.test.ts`
 *     uses).
 *
 * What this script does NOT claim: an end-to-end run of the Inspector
 * CLI's own OAuth-aware transport with a bearer token injected via
 * `--header`. That was attempted and found unreliable -- the Inspector
 * CLI's transport prioritizes its own OAuth auto-discovery over a
 * manually supplied `Authorization` header once a server advertises OAuth
 * via `WWW-Authenticate`, and hangs past its own `--connect-timeout`
 * waiting on that flow rather than using the supplied token. This is a
 * client-side behavior of the Inspector CLI itself, not a defect in this
 * server: the identical protocol round trip (steps 1-2 above) succeeds
 * every time through the official SDK client. The Inspector CLI's own
 * `--help` documents the realistic non-interactive path for this exact
 * situation -- `--use-stored-auth` / `--wait-for-auth` after a human
 * completes OAuth once in a browser -- which is what this script prints
 * as the manual completion step, matching this repository's established
 * pattern for every other step that structurally requires a human in the
 * loop (`connector-smoke-codex.ts`, `connector-smoke-claude-code.ts`).
 */

import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { eq } from 'drizzle-orm';
import { commandIsAvailable, runCli, runHarnessMain } from './connector-smoke-support';

function parseHostArgument(argv: readonly string[]): string | undefined {
	const flagIndex = argv.indexOf('--host');
	if (flagIndex === -1) return undefined;
	return argv[flagIndex + 1];
}

function extractHiddenInputValue(html: string, fieldName: string): string {
	const match = html.match(new RegExp(`name="${fieldName}"\\s+value="([^"]+)"`));
	if (!match) {
		throw new Error(`Could not find hidden input "${fieldName}" in consent page HTML`);
	}
	return match[1]!;
}

export async function selfHostLocally(): Promise<{ baseUrl: string; stop: () => void }> {
	process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? 'google-client-id';
	process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? 'google-client-secret';
	process.env.SESSION_SIGNING_SECRET =
		process.env.SESSION_SIGNING_SECRET ?? 'development-session-secret-with-at-least-32-characters';
	process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
	process.env.MCP_ALLOWED_ORIGINS = process.env.MCP_ALLOWED_ORIGINS ?? 'http://localhost:3000';

	const { handleApplicationRequest } = await import('@web/application');

	const server = Bun.serve({
		port: 0,
		fetch(request, bunServer) {
			return handleApplicationRequest(request, {
				clientAddress: bunServer.requestIP(request)?.address,
			});
		},
	});

	return {
		baseUrl: `http://127.0.0.1:${server.port}`,
		stop: () => server.stop(true),
	};
}

/**
 * Real authorize -> approve -> token round trip against a locally
 * self-hosted instance, mirroring `oauth-mcp-resource-binding.integration
 * .test.ts`'s `obtainAccessToken`. Only usable when this script self-hosts
 * (it needs direct database access to seed a user and OAuth client, which
 * a real deployment's operator would never grant this script).
 */
export async function obtainRealAccessToken(
	baseUrl: string,
): Promise<{ token: string; email: string; cleanup: () => Promise<void> }> {
	const { database, schema } = await import('@template/database');
	const { hashCredential } = await import('@web/lib/hash-credential');
	const { createSession } = await import('@web/lib/session-authentication');

	const testRunId = randomUUID();
	const userId = randomUUID();
	const email = `inspector-smoke-${testRunId}@example.com`;
	const clientId = `inspector-smoke-${testRunId}`;
	const clientSecret = 'inspector-smoke-client-secret';
	const codeVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
	const codeChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

	// OPEN-12: `users` and `oauth_clients` are independent parents here --
	// neither references the other -- and every statement is a separate HTTP
	// round trip through the Neon driver. Issued together rather than
	// sequentially, which halves the seeding cost of a harness that already
	// pays for a full OAuth round trip afterwards.
	await Promise.all([
		database.insert(schema.users).values({
			id: userId,
			email,
			name: 'Inspector Smoke Test User',
			image: null,
			emailVerified: true,
			role: 'user',
		}),
		database.insert(schema.oauthClients).values({
			clientId,
			clientSecret: hashCredential(clientSecret),
			clientName: 'Inspector Smoke Test Client',
			clientType: 'confidential',
			tokenEndpointAuthMethod: 'client_secret_post',
			redirectUris: ['https://example.com/callback'],
			grantTypes: ['authorization_code', 'refresh_token'],
			responseTypes: ['code'],
		}),
	]);

	try {
		const session = await createSession({ userId, request: new Request(`${baseUrl}/`) });
		const cookie = session.cookieHeaderValue.split(';')[0]!;
		const resource = `${baseUrl}/mcp`;

		const consentResponse = await fetch(
			`${baseUrl}/oauth/authorize?client_id=${clientId}&redirect_uri=https://example.com/callback&response_type=code&code_challenge=${codeChallenge}&resource=${encodeURIComponent(resource)}`,
			{ headers: { cookie } },
		);
		if (consentResponse.status !== 200) {
			throw new Error(`GET /oauth/authorize -> ${consentResponse.status}, expected 200`);
		}
		const html = await consentResponse.text();
		const transactionId = extractHiddenInputValue(html, 'transaction_id');
		const csrfToken = extractHiddenInputValue(html, 'csrf_token');

		const approveResponse = await fetch(`${baseUrl}/oauth/authorize/approve`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				cookie,
				'content-type': 'application/x-www-form-urlencoded',
				'sec-fetch-site': 'same-origin',
			},
			body: new URLSearchParams({
				transaction_id: transactionId,
				csrf_token: csrfToken,
			}).toString(),
		});
		if (approveResponse.status !== 302) {
			throw new Error(`POST /oauth/authorize/approve -> ${approveResponse.status}, expected 302`);
		}
		const location = new URL(approveResponse.headers.get('location')!);
		const code = location.searchParams.get('code')!;

		const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				grant_type: 'authorization_code',
				code,
				redirect_uri: 'https://example.com/callback',
				client_id: clientId,
				client_secret: clientSecret,
				code_verifier: codeVerifier,
				resource,
			}).toString(),
		});
		if (tokenResponse.status !== 200) {
			throw new Error(`POST /oauth/token -> ${tokenResponse.status}, expected 200`);
		}
		const tokenBody = (await tokenResponse.json()) as { access_token: string };
		return {
			token: tokenBody.access_token,
			email,
			// Deliberately NOT run until the caller is done using the token --
			// deleting the client row cascade-deletes the token row itself
			// (DATA-001), which would invalidate the token before it was ever
			// used if this ran eagerly in a `finally` here.
			cleanup: async () => {
				// Deleting `users` cascades to `user_sessions`, so ordering is
				// not load-bearing between these three; issued together for
				// the same round-trip reason as the seeding above.
				await Promise.all([
					database.delete(schema.oauthClients).where(eq(schema.oauthClients.clientId, clientId)),
					database.delete(schema.userSessions).where(eq(schema.userSessions.userId, userId)),
					database.delete(schema.users).where(eq(schema.users.id, userId)),
				]);
			},
		};
	} catch (error) {
		// The token was never issued -- nothing to leave behind but the seeded
		// user/client rows, which normal cleanup would never otherwise reach.
		await Promise.all([
			database.delete(schema.oauthClients).where(eq(schema.oauthClients.clientId, clientId)),
			database.delete(schema.userSessions).where(eq(schema.userSessions.userId, userId)),
			database.delete(schema.users).where(eq(schema.users.id, userId)),
		]);
		throw error;
	}
}

/**
 * Runs the authenticated Inspector-protocol check against `baseUrl` with a
 * real access token, appending any assertion failure to `problems`.
 *
 * Review finding (P2): once `obtainRealAccessToken` has succeeded (a real
 * seeded user, confidential client, session, access token, and refresh
 * token now exist), everything here used to run outside any try/finally of
 * its own -- if `client.connect`, `listTools`, `callTool`, or `client.close`
 * threw, control jumped straight to `main`'s own outer `finally`, which
 * only stops the local server. `cleanup()` was never reached, leaving
 * every one of those rows behind, and a repeated failing run accumulates
 * more live test credentials each time. Wrapping the client work in its
 * own try/finally, and `client.close()` in a `finally` of its own so a
 * `close()` failure can't itself skip `cleanup()`, guarantees `cleanup()`
 * runs on every exit path -- success, assertion failure, or thrown error
 * alike. Exported so this guarantee is directly testable against the real
 * database without driving the whole CLI (`connector-smoke-inspector.test.ts`).
 */
export async function runAuthenticatedInspectorCheck(
	baseUrl: string,
	problems: string[],
): Promise<void> {
	const { token, email, cleanup } = await obtainRealAccessToken(baseUrl);

	try {
		const client = new Client({ name: 'connector-smoke-inspector', version: '1.0.0' });
		const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
			// `requestInit.headers` alone is not reliably applied to every
			// request the transport makes -- `oauth-mcp-resource-binding
			// .integration.test.ts` documents the same finding for
			// `Content-Type` and settled on overriding `fetch` directly,
			// building the header set from a real `Headers(...)` instance
			// (never an object spread of one, which silently drops entries).
			fetch: (input, init) => {
				const headers = new Headers(init?.headers);
				headers.set('authorization', `Bearer ${token}`);
				return fetch(input, { ...init, headers });
			},
		});
		try {
			await client.connect(transport);

			const tools = await client.listTools();
			const profileTool = tools.tools.find((tool) => tool.name === 'get_user_profile');
			if (!profileTool) {
				problems.push(
					`tools/list did not include get_user_profile: ${JSON.stringify(tools.tools)}`,
				);
			} else if (profileTool.annotations?.readOnlyHint !== true) {
				problems.push(
					`get_user_profile is missing readOnlyHint: true in its own tools/list annotations: ${JSON.stringify(profileTool.annotations)}`,
				);
			} else if (!profileTool.title) {
				problems.push('get_user_profile has no title in its own tools/list output');
			} else {
				console.log(
					'[connector-smoke-inspector] tools/list lists get_user_profile with title and readOnlyHint intact',
				);
			}

			const result = await client.callTool({ name: 'get_user_profile', arguments: {} });
			const resultText = JSON.stringify(result);
			if (result.isError) {
				problems.push(`tools/call get_user_profile returned isError: true: ${resultText}`);
			} else if (!resultText.includes(email)) {
				problems.push(
					`tools/call get_user_profile did not return the test user's own email: ${resultText}`,
				);
			} else {
				console.log(
					'[connector-smoke-inspector] tools/call get_user_profile returned the real, authenticated profile',
				);
			}
		} finally {
			await client.close();
		}
	} finally {
		await cleanup();
	}
}

async function main(): Promise<void> {
	const host = parseHostArgument(process.argv.slice(2));
	let stopLocalServer: (() => void) | undefined;
	let baseUrl: string;
	const selfHosted = !host;

	if (host) {
		baseUrl = host.replace(/\/$/, '');
		console.log(`[connector-smoke-inspector] targeting ${baseUrl} (not self-hosted)`);
	} else {
		console.log('[connector-smoke-inspector] no --host given; self-hosting this server locally');
		const local = await selfHostLocally();
		baseUrl = local.baseUrl;
		stopLocalServer = local.stop;
		console.log(`[connector-smoke-inspector] self-hosted at ${baseUrl}`);
	}

	const problems: string[] = [];

	try {
		if (!commandIsAvailable('bunx')) {
			throw new Error('`bunx` is not on PATH.');
		}

		console.log(
			'[connector-smoke-inspector] running the real MCP Inspector CLI, unauthenticated, against /mcp (expect it to detect OAuth is required and refuse to proceed)...',
		);
		const unauthenticatedResult = await runCli(
			'bunx',
			[
				'--bun',
				'@modelcontextprotocol/inspector',
				'--cli',
				'--transport',
				'http',
				'--server-url',
				`${baseUrl}/mcp`,
				'--format',
				'json',
				'--stored-auth-only',
				'--method',
				'tools/list',
			],
			{ timeoutMs: 20_000 },
		);
		if (unauthenticatedResult.exitCode === 0) {
			problems.push(
				'MCP Inspector CLI succeeded without any stored auth -- this server must require a bearer token at /mcp',
			);
		} else if (unauthenticatedResult.timedOut) {
			problems.push('MCP Inspector CLI hung past its own timeout on the unauthenticated probe');
		} else {
			console.log(
				`[connector-smoke-inspector] MCP Inspector CLI correctly refused (exit ${unauthenticatedResult.exitCode}): ${(unauthenticatedResult.stdout || unauthenticatedResult.stderr).trim()}`,
			);
		}

		if (!selfHosted) {
			console.log('');
			console.log(
				'[connector-smoke-inspector] --host given: this script cannot complete browser OAuth against a real deployment.',
			);
			console.log(
				'[connector-smoke-inspector] to finish the authenticated Inspector check by hand, run once (opens a browser):',
			);
			console.log(
				`  bunx --bun @modelcontextprotocol/inspector --cli --transport http --server-url ${baseUrl}/mcp --method tools/list`,
			);
			console.log(
				'[connector-smoke-inspector] then re-run non-interactively using the stored token:',
			);
			console.log(
				`  bunx --bun @modelcontextprotocol/inspector --cli --transport http --server-url ${baseUrl}/mcp --use-stored-auth --method tools/call --tool-name get_user_profile`,
			);
		} else {
			console.log(
				"[connector-smoke-inspector] proving the same wire protocol the Inspector CLI speaks works end to end, authenticated, via the official SDK client (see this file's header comment for why the Inspector CLI itself is not driven through the authenticated half automatically)...",
			);
			await runAuthenticatedInspectorCheck(baseUrl, problems);
		}
	} finally {
		stopLocalServer?.();
	}

	if (problems.length > 0) {
		console.error('');
		console.error('[connector-smoke-inspector] FAILED:');
		for (const problem of problems) {
			console.error(`  - ${problem}`);
		}
		process.exit(1);
	}

	console.log('');
	console.log('[connector-smoke-inspector] every automatable step passed.');

	// Standalone script, not `bun test`: nothing tears down the module-level
	// database/Redis clients `@web/application` opened, so without an
	// explicit exit the process hangs indefinitely after this line (same
	// finding `connector-smoke-codex.ts` documented).
	process.exit(0);
}

// Sibling defect found and fixed alongside the same gap in
// `deployed-streaming.ts`/`deployed-smoke.ts` (round-16 review, thread 7 and
// thread 8): without this guard, merely `import`-ing this module -- exactly
// what `connector-smoke-inspector.test.ts` does to unit test
// `runAuthenticatedInspectorCheck`/`obtainRealAccessToken` -- ran the real
// `main()` against `process.argv`, including a real network `bunx` install
// and a real `process.exit()` that tears down the importing process.
if (import.meta.main) {
	await runHarnessMain('connector-smoke-inspector', main);
}
