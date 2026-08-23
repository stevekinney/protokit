#!/usr/bin/env bun
/**
 * `OPS-001`: `bun run test:deployed-smoke -- https://HOST`
 *
 * Validates the public deployment envelope's discoverable surface against a
 * real host: public DNS resolution, a valid TLS chain, the three discovery
 * documents and `/mcp`'s unauthenticated 401 challenge reachable at their
 * canonical URL with no cross-host redirect anywhere along the way.
 *
 * Genuinely needs a live, publicly reachable deployment -- there is no
 * local self-host fallback here (unlike `connector-smoke-*.ts`), because
 * "public DNS resolves to a permitted public address" and "the TLS chain
 * validates from outside the deployment network" are meaningless against
 * `127.0.0.1`. Run with no `HOST` argument to see this stated plainly and
 * exit non-zero rather than silently reporting a false pass.
 */

import {
	checkDiscoveryDocumentIsHealthy,
	checkNoCrossHostRedirect,
	checkPublicDnsResolution,
} from '@web/deployed-validation-support';

const CANONICAL_PATHS = [
	'/.well-known/oauth-authorization-server',
	'/.well-known/oauth-protected-resource',
	'/.well-known/oauth-protected-resource/mcp',
	'/mcp',
] as const;

/**
 * A review finding (P2): `checkNoCrossHostRedirect` only reports whether a
 * response redirected cross-host -- for its own stated purpose, "no
 * problem" correctly includes a 404 or 500 (neither is a redirect). This
 * harness's discovery-URL loop then treated that same "no problem" as "this
 * endpoint is healthy," so a discovery document that 404s or 500s on the
 * deployed host logged a pass and the harness could finish with "every
 * automated check passed" while two of the three canonical discovery
 * documents were never actually confirmed reachable and well-formed (only
 * `/.well-known/oauth-protected-resource/mcp` got an explicit `response.ok`
 * check, in the TLS/reachability step above). Every discovery document
 * (not `/mcp` itself, which is expected to 401 unauthenticated) must return
 * a successful, JSON-parseable response.
 */
const DISCOVERY_DOCUMENT_PATHS = [
	'/.well-known/oauth-authorization-server',
	'/.well-known/oauth-protected-resource',
	'/.well-known/oauth-protected-resource/mcp',
] as const;

async function main(): Promise<void> {
	const hostArgument = process.argv[2];
	if (!hostArgument) {
		console.error('[deployed-smoke] usage: bun run test:deployed-smoke -- https://HOST');
		console.error(
			'[deployed-smoke] this harness validates a real, public deployment -- there is no local fallback.',
		);
		process.exit(1);
	}

	const baseUrl = hostArgument.replace(/\/$/, '');
	const url = new URL(baseUrl);
	if (url.protocol !== 'https:') {
		console.error(`[deployed-smoke] HOST must be an https:// URL, got: ${baseUrl}`);
		process.exit(1);
	}

	const problems: string[] = [];

	console.log(`[deployed-smoke] resolving DNS for ${url.hostname}...`);
	const dnsResult = await checkPublicDnsResolution(url.hostname);
	if (dnsResult.problems.length > 0) {
		problems.push(...dnsResult.problems);
	} else {
		console.log(
			`[deployed-smoke] ${url.hostname} resolves to ${dnsResult.addresses.map((a) => a.address).join(', ')} (all public)`,
		);
	}

	console.log('[deployed-smoke] validating TLS chain and reachability...');
	try {
		// A plain `fetch` with Bun/Node's default TLS validation IS the TLS
		// chain check -- rejecting a self-signed or otherwise untrusted
		// certificate is exactly what "the TLS chain validates" requires, and
		// re-implementing certificate-chain verification here would only add
		// a second, less-trustworthy validator next to the one Bun already
		// ships. Deliberately does not assert on the response status here --
		// that's the discovery-document loop's job below (which also parses
		// the body), so a document-level failure isn't reported twice under
		// two different messages.
		await fetch(`${baseUrl}/.well-known/oauth-protected-resource/mcp`, {
			signal: AbortSignal.timeout(10_000),
		});
		console.log('[deployed-smoke] TLS chain validates; server is reachable over HTTPS');
	} catch (error) {
		problems.push(
			`TLS/reachability check failed against ${baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	console.log('[deployed-smoke] checking discovery/OAuth/MCP URLs for cross-host redirects...');
	for (const path of CANONICAL_PATHS) {
		const result = await checkNoCrossHostRedirect(baseUrl, path);
		if (result.problem) {
			problems.push(result.problem);
		} else {
			console.log(`[deployed-smoke]   ${path} -> no cross-host redirect`);
		}
	}

	console.log(
		'[deployed-smoke] checking discovery documents return successful, well-formed JSON...',
	);
	for (const path of DISCOVERY_DOCUMENT_PATHS) {
		const result = await checkDiscoveryDocumentIsHealthy(baseUrl, path);
		if (result.problem) {
			problems.push(result.problem);
		} else {
			console.log(`[deployed-smoke]   ${path} -> valid JSON`);
		}
	}

	console.log('[deployed-smoke] checking /mcp unauthenticated challenge...');
	try {
		const mcpResponse = await fetch(`${baseUrl}/mcp`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 1 }),
			signal: AbortSignal.timeout(10_000),
		});
		if (mcpResponse.status !== 401) {
			problems.push(`unauthenticated POST /mcp returned ${mcpResponse.status}, expected 401`);
		} else if (!mcpResponse.headers.get('www-authenticate')?.includes('resource_metadata')) {
			problems.push(
				'unauthenticated POST /mcp returned 401 but WWW-Authenticate is missing a resource_metadata challenge',
			);
		} else {
			console.log('[deployed-smoke] /mcp correctly challenges an unauthenticated request');
		}
	} catch (error) {
		problems.push(
			`/mcp reachability check failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (problems.length > 0) {
		console.error('');
		console.error('[deployed-smoke] FAILED:');
		for (const problem of problems) {
			console.error(`  - ${problem}`);
		}
		process.exit(1);
	}

	console.log('');
	console.log('[deployed-smoke] every automated check passed against a real, public deployment.');
	process.exit(0);
}

await main();
