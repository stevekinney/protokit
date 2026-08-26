/**
 * `INTEROP-001`: shared, host-product-agnostic logic for the two connector
 * smoke harnesses (`connector-smoke-codex.ts`, `connector-smoke-claude-code.ts`).
 *
 * Deliberately has NO import of `@web/env` or anything that transitively
 * imports it (`@web/application`, `@web/lib/session-authentication`, ...).
 * `env.ts` validates `process.env` once, at import time, so every
 * caller of this module must finish setting environment variables *before*
 * it imports anything env-backed -- importing this file first, before that
 * env-backed import, keeps that ordering obvious at the call site instead
 * of hiding it inside a shared module.
 */

export interface CliRunResult {
	readonly exitCode: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
}

/**
 * Runs an external CLI (`codex`, `claude`) with a hard timeout. Every
 * invocation here is expected to be non-interactive and short-lived --
 * `mcp add`/`mcp get`/`mcp remove`, never `mcp login` (which opens a
 * browser and blocks on a human). Bun.spawn is used directly (not
 * `scripts/utilities.ts`'s `execute`, which has no timeout) so a CLI that
 * unexpectedly prompts or hangs is killed rather than left to block this
 * harness indefinitely.
 */
export async function runCli(
	command: string,
	arguments_: readonly string[],
	options: { env?: Record<string, string>; timeoutMs?: number } = {},
): Promise<CliRunResult> {
	const timeoutMs = options.timeoutMs ?? 30_000;
	const environment: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value !== undefined) environment[key] = value;
	}
	Object.assign(environment, options.env);

	const subprocess = Bun.spawn([command, ...arguments_], {
		env: environment,
		stdout: 'pipe',
		stderr: 'pipe',
	});

	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		subprocess.kill();
	}, timeoutMs);

	const [stdout, stderr] = await Promise.all([
		new Response(subprocess.stdout).text(),
		new Response(subprocess.stderr).text(),
	]);
	const exitCode = await subprocess.exited;
	clearTimeout(timeout);

	return { exitCode, stdout, stderr, timedOut };
}

export function commandIsAvailable(command: string): boolean {
	try {
		const result = Bun.spawnSync(['which', command], { stdout: 'ignore', stderr: 'ignore' });
		return result.exitCode === 0;
	} catch {
		return false;
	}
}

export interface DiscoveryDocuments {
	readonly authorizationServerMetadata: Record<string, unknown>;
	readonly protectedResourceMetadata: Record<string, unknown>;
	readonly protectedResourceMcpMetadata: Record<string, unknown>;
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
	const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
	if (!response.ok) {
		throw new Error(`${url} responded ${response.status}`);
	}
	return (await response.json()) as Record<string, unknown>;
}

export async function fetchDiscoveryDocuments(baseUrl: string): Promise<DiscoveryDocuments> {
	const [authorizationServerMetadata, protectedResourceMetadata, protectedResourceMcpMetadata] =
		await Promise.all([
			fetchJson(`${baseUrl}/.well-known/oauth-authorization-server`),
			fetchJson(`${baseUrl}/.well-known/oauth-protected-resource`),
			fetchJson(`${baseUrl}/.well-known/oauth-protected-resource/mcp`),
		]);

	return {
		authorizationServerMetadata,
		protectedResourceMetadata,
		protectedResourceMcpMetadata,
	};
}

/**
 * Checks the exact fields Codex CLI and Claude Code's own OAuth clients
 * read off discovery -- not a re-statement of `oauth-discovery.test.ts`
 * (which proves the *origin* is canonical), but the *shape* a real
 * connector-registration client depends on: PKCE S256, the authorization
 * code + refresh grants, a registration endpoint (DCR) and CIMD support
 * advertised, and the protected-resource document naming this server's
 * `/mcp` resource. Returns a list of human-readable problems; empty means
 * every checked field was present and correctly shaped.
 */
export function checkDiscoveryDocumentsForConnectorCompatibility(
	documents: DiscoveryDocuments,
): string[] {
	const problems: string[] = [];
	const authorizationServer = documents.authorizationServerMetadata;
	const protectedResource = documents.protectedResourceMetadata;
	const protectedResourceMcp = documents.protectedResourceMcpMetadata;

	function requireField(object: Record<string, unknown>, field: string, label: string) {
		if (!(field in object)) {
			problems.push(`${label} is missing "${field}"`);
		}
	}

	function requireArrayIncludes(
		object: Record<string, unknown>,
		field: string,
		value: string,
		label: string,
	) {
		const arrayValue = object[field];
		if (!Array.isArray(arrayValue) || !arrayValue.includes(value)) {
			problems.push(`${label}'s "${field}" does not include "${value}"`);
		}
	}

	requireField(authorizationServer, 'authorization_endpoint', 'authorization server metadata');
	requireField(authorizationServer, 'token_endpoint', 'authorization server metadata');
	requireField(authorizationServer, 'registration_endpoint', 'authorization server metadata');
	requireArrayIncludes(
		authorizationServer,
		'response_types_supported',
		'code',
		'authorization server metadata',
	);
	requireArrayIncludes(
		authorizationServer,
		'grant_types_supported',
		'authorization_code',
		'authorization server metadata',
	);
	requireArrayIncludes(
		authorizationServer,
		'grant_types_supported',
		'refresh_token',
		'authorization server metadata',
	);
	requireArrayIncludes(
		authorizationServer,
		'code_challenge_methods_supported',
		'S256',
		'authorization server metadata',
	);
	if (authorizationServer['client_id_metadata_document_supported'] !== true) {
		problems.push(
			'authorization server metadata does not advertise client_id_metadata_document_supported: true (CIMD)',
		);
	}

	requireField(protectedResource, 'resource', 'protected resource metadata');
	requireField(protectedResource, 'authorization_servers', 'protected resource metadata');
	if (!(protectedResource['resource'] as string | undefined)?.endsWith('/mcp')) {
		problems.push('protected resource metadata\'s "resource" does not identify the /mcp endpoint');
	}

	requireField(protectedResourceMcp, 'resource', 'protected resource MCP metadata');

	return problems;
}

/**
 * `codex mcp add`/`claude mcp add` against a real, live, OAuth-protected
 * `/mcp` URL doesn't just write local configuration -- both CLIs probe the
 * endpoint immediately and, on detecting OAuth is required, print the real
 * authorization URL they constructed and start waiting on a browser
 * (confirmed empirically for both; there is no flag that defers this to a
 * later, explicit `login` step). That is unavoidable and this harness
 * can't complete it non-interactively, but the URL itself is strong
 * automated evidence: it proves the CLI's real OAuth client correctly
 * read this server's discovery documents and built a spec-correct
 * authorization request. Extracts that URL from combined stdout/stderr and
 * validates PKCE S256, the `code` response type, a non-empty scope, and a
 * `resource` parameter matching this server's `/mcp` endpoint.
 */
export function extractAndValidateAuthorizeUrl(
	combinedOutput: string,
	baseUrl: string,
): { url: string; problems: string[] } | null {
	const match = combinedOutput.match(
		new RegExp(`${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/oauth/authorize\\?[^\\s]+`),
	);
	if (!match) return null;

	const url = new URL(match[0]);
	const problems: string[] = [];

	if (url.searchParams.get('response_type') !== 'code') {
		problems.push('authorize URL response_type is not "code"');
	}
	if (url.searchParams.get('code_challenge_method') !== 'S256') {
		problems.push('authorize URL code_challenge_method is not "S256"');
	}
	if (!url.searchParams.get('code_challenge')) {
		problems.push('authorize URL is missing code_challenge');
	}
	if (!url.searchParams.get('scope')) {
		problems.push('authorize URL is missing scope');
	}
	if (url.searchParams.get('resource') !== `${baseUrl}/mcp`) {
		problems.push(
			`authorize URL resource "${url.searchParams.get('resource')}" does not match ${baseUrl}/mcp`,
		);
	}
	if (!url.searchParams.get('client_id')) {
		problems.push('authorize URL is missing client_id');
	}

	return { url: match[0], problems };
}

export function printManualCompletionSteps(options: {
	readonly cliLabel: string;
	readonly serverName: string;
	readonly baseUrl: string;
	readonly addCommand: string;
	readonly loginCommand: string;
	readonly toolInvocationExample: string;
}): void {
	console.log('');
	console.log('================================================================');
	console.log(`MANUAL COMPLETION REQUIRED -- ${options.cliLabel}`);
	console.log('================================================================');
	console.log('Everything above this block is automated and just ran for real against');
	console.log(`${options.baseUrl}. What remains needs a human clicking through a real`);
	console.log("browser OAuth consent screen (Google sign-in, then this server's own");
	console.log('consent page) -- that step cannot be scripted from a non-interactive agent');
	console.log('session, locally or against a real deployed host. To finish by hand:');
	console.log('');
	console.log(`  1. ${options.addCommand}`);
	console.log(`  2. ${options.loginCommand}`);
	console.log(`  3. ${options.toolInvocationExample}`);
	console.log('');
	console.log("This satisfies the roadmap's deployed-smoke acceptance criteria once run");
	console.log(`against a real public deployment (pass --host https://your-deployment).`);
	console.log(
		`Remove the temporary connector afterward: ${options.cliLabel === 'Codex CLI' ? `codex mcp remove ${options.serverName}` : `claude mcp remove ${options.serverName}`}`,
	);
	console.log('================================================================');
}

/**
 * Runs a harness `main()` and converts anything it throws into the same
 * one-readable-line-then-exit-1 shape these harnesses already use for a
 * failed check.
 *
 * Found while writing the deployment runbook, by pointing each harness at a
 * host that does not resolve — the first thing that actually happens in
 * practice, on a typo'd hostname. `deployed-smoke.ts` handled it correctly;
 * `deployed-oauth.ts` and `deployed-streaming.ts` printed a raw Bun stack
 * trace (`ConnectionRefused` out of `fetchJson` here, `ERA_NEGOTIATION_FAILED`
 * out of the MCP SDK's transport). An operator's first encounter with this
 * tooling should not be a stack trace through `node_modules`.
 *
 * Deliberately shared rather than pasted into each entrypoint: the reason
 * this was worth fixing at all is that one harness had the behavior and its
 * siblings did not.
 */
export async function runHarnessMain(label: string, main: () => Promise<void>): Promise<void> {
	try {
		await main();
	} catch (error) {
		const description = error instanceof Error ? error.message : String(error);
		console.error(`[${label}] failed: ${description}`);
		console.error(
			`[${label}] this usually means the host is unreachable, the URL is wrong, or the ` +
				'deployment is not serving yet. Check the URL and try again.',
		);
		process.exit(1);
	}
}
