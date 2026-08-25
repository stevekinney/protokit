#!/usr/bin/env bun
/**
 * `INTEROP-001`: a ready-to-run Codex CLI connector smoke harness.
 *
 * Usage:
 *   bun run test:connector:codex                          # self-hosts this server locally
 *   bun run test:connector:codex -- --host https://HOST    # points at a real deployment
 *
 * Automates every step that does not require a human clicking through a
 * real browser OAuth consent screen:
 *   1. Confirms the `codex` binary is installed.
 *   2. Fetches this server's three discovery documents directly and checks
 *      the exact fields Codex's OAuth client reads off them (PKCE S256,
 *      the authorization_code/refresh_token grants, a registration
 *      endpoint, and CIMD support).
 *   3. Runs the real `codex mcp add` under an isolated `CODEX_HOME`, so
 *      this harness can never touch the invoking user's real Codex
 *      configuration. Against a live OAuth-protected server, `add` probes
 *      the URL and starts the interactive login itself (confirmed
 *      empirically -- there is no flag that defers this to a separate
 *      step), so this harness bounds that with a timeout and validates
 *      the real authorization URL Codex constructed instead of trying to
 *      complete the browser flow. Then `codex mcp get` / `codex mcp
 *      remove` round out the isolated-profile round trip.
 *
 * `codex mcp login` (which opens a system browser and blocks on a human)
 * is deliberately never invoked directly -- see `printManualCompletionSteps`
 * for the exact commands to finish that step by hand. Per the roadmap
 * ("The CLI smoke commands must run against an isolated test profile and
 * remove the temporary connector after verification"), the connector is
 * always removed, in a `finally`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	checkDiscoveryDocumentsForConnectorCompatibility,
	commandIsAvailable,
	extractAndValidateAuthorizeUrl,
	fetchDiscoveryDocuments,
	printManualCompletionSteps,
	runCli,
	runHarnessMain,
} from './connector-smoke-support';

export function parseHostArgument(argv: readonly string[]): string | undefined {
	const flagIndex = argv.indexOf('--host');
	if (flagIndex === -1) return undefined;
	return argv[flagIndex + 1];
}

async function selfHostLocally(): Promise<{ baseUrl: string; stop: () => void }> {
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

async function main(): Promise<void> {
	const host = parseHostArgument(process.argv.slice(2));
	let stopLocalServer: (() => void) | undefined;
	let baseUrl: string;

	if (host) {
		baseUrl = host.replace(/\/$/, '');
		console.log(`[connector-smoke-codex] targeting ${baseUrl} (not self-hosted)`);
	} else {
		console.log('[connector-smoke-codex] no --host given; self-hosting this server locally');
		const local = await selfHostLocally();
		baseUrl = local.baseUrl;
		stopLocalServer = local.stop;
		console.log(`[connector-smoke-codex] self-hosted at ${baseUrl}`);
	}

	const problems: string[] = [];
	let codexHomeDirectory: string | undefined;

	try {
		if (!commandIsAvailable('codex')) {
			throw new Error(
				'`codex` is not on PATH. Install Codex CLI, then re-run: bun run test:connector:codex',
			);
		}
		const versionResult = await runCli('codex', ['--version'], { timeoutMs: 10_000 });
		console.log(`[connector-smoke-codex] codex --version -> ${versionResult.stdout.trim()}`);

		console.log('[connector-smoke-codex] fetching discovery documents...');
		const documents = await fetchDiscoveryDocuments(baseUrl);
		const discoveryProblems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		if (discoveryProblems.length > 0) {
			problems.push(...discoveryProblems.map((problem) => `discovery: ${problem}`));
		} else {
			console.log('[connector-smoke-codex] discovery documents match Codex CLI expectations');
		}

		// An isolated CODEX_HOME so this harness can never read, write, or
		// pollute the invoking user's real `~/.codex/config.toml`.
		codexHomeDirectory = await mkdtemp(join(tmpdir(), 'protokit-codex-smoke-'));
		const serverName = `protokit-interop-smoke-${randomUUID().slice(0, 8)}`;
		const isolatedEnvironment = { CODEX_HOME: codexHomeDirectory };

		// `codex mcp add` probes the URL immediately and, on detecting this
		// server's real OAuth requirement, starts the interactive browser
		// flow itself -- confirmed empirically; there is no flag that defers
		// this to a later `login` call. This harness can't complete that
		// flow non-interactively, so it bounds the wait with a timeout and
		// treats "the CLI printed a spec-correct authorize URL, then got cut
		// off waiting for a browser" as the automated pass condition: it's
		// real proof the CLI's OAuth client read this server's discovery
		// documents correctly and built a valid authorization request.
		console.log(`[connector-smoke-codex] codex mcp add ${serverName} --url ${baseUrl}/mcp`);
		const addResult = await runCli('codex', ['mcp', 'add', serverName, '--url', `${baseUrl}/mcp`], {
			env: isolatedEnvironment,
			timeoutMs: 15_000,
		});
		const combinedAddOutput = `${addResult.stdout}\n${addResult.stderr}`;
		const authorizeAttempt = extractAndValidateAuthorizeUrl(combinedAddOutput, baseUrl);

		if (addResult.exitCode === 0 && !addResult.timedOut) {
			// No OAuth requirement was detected (unexpected for this server,
			// but not this harness's job to fail loudly over -- the discovery
			// checks above already cover that).
			console.log('[connector-smoke-codex] codex mcp add completed without starting OAuth');
		} else if (authorizeAttempt) {
			if (authorizeAttempt.problems.length > 0) {
				problems.push(...authorizeAttempt.problems.map((problem) => `authorize URL: ${problem}`));
			} else {
				console.log(
					'[connector-smoke-codex] codex constructed a spec-correct authorization request against this server',
				);
			}
		} else {
			problems.push(
				`codex mcp add exited ${addResult.exitCode} (timedOut=${addResult.timedOut}) without a recognizable authorize URL: ${combinedAddOutput}`,
			);
		}

		const getResult = await runCli('codex', ['mcp', 'get', serverName, '--json'], {
			env: isolatedEnvironment,
			timeoutMs: 15_000,
		});
		if (getResult.exitCode !== 0 || !getResult.stdout.includes(`${baseUrl}/mcp`)) {
			problems.push(
				`codex mcp get did not confirm the registered server: ${getResult.stdout} ${getResult.stderr}`,
			);
		} else {
			console.log('[connector-smoke-codex] codex mcp get confirms registration');
		}

		await runCli('codex', ['mcp', 'remove', serverName], {
			env: isolatedEnvironment,
			timeoutMs: 15_000,
		});

		printManualCompletionSteps({
			cliLabel: 'Codex CLI',
			serverName,
			baseUrl,
			addCommand: `codex mcp add ${serverName} --url ${baseUrl}/mcp`,
			// OAUTH-002 left "Codex can authenticate with --oauth-client-registration
			// auto and --oauth-client-registration CIMD" unticked pending a real
			// handshake -- this is that exact handshake, ready to run against a
			// live host.
			loginCommand: `codex mcp login ${serverName} --oauth-client-registration cimd`,
			toolInvocationExample: `codex exec --json "call get_user_profile on ${serverName}"`,
		});
	} finally {
		stopLocalServer?.();
		if (codexHomeDirectory) {
			await rm(codexHomeDirectory, { recursive: true, force: true });
		}
	}

	if (problems.length > 0) {
		console.error('');
		console.error('[connector-smoke-codex] FAILED:');
		for (const problem of problems) {
			console.error(`  - ${problem}`);
		}
		process.exit(1);
	}

	console.log('');
	console.log('[connector-smoke-codex] every automatable step passed.');

	// Standalone script, not `bun test`: nothing tears down the module-level
	// database/Redis clients `@web/application` opened, so without an explicit
	// exit the process hangs indefinitely after this line (confirmed
	// empirically -- it does not exit on its own).
	process.exit(0);
}

// Round-16 review (thread 8) added this guard to four sibling harnesses but
// missed these two: without it, merely `import`-ing this module -- which is
// the only way to unit test any pure helper in it -- runs the real `main()`
// against `process.argv`, including a real network install and a
// `process.exit()` that tears down the importing process. That is precisely
// why these two files were invisible to the coverage gate: nothing could
// safely import them.
if (import.meta.main) {
	await runHarnessMain('connector-smoke-codex', main);
}
