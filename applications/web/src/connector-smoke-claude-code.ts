#!/usr/bin/env bun
/**
 * `INTEROP-001`: a ready-to-run Claude Code CLI connector smoke harness.
 *
 * Usage:
 *   bun run test:connector:claude-code                          # self-hosts this server locally
 *   bun run test:connector:claude-code -- --host https://HOST   # points at a real deployment
 *
 * Mirrors `connector-smoke-codex.ts` exactly, for Claude Code's `claude
 * mcp` CLI instead of Codex's. See that file's header comment for the full
 * rationale; the only material differences are Claude Code's flags
 * (`--transport http`, `-s local`) and its isolation mechanism
 * (`CLAUDE_CONFIG_DIR`, verified empirically to leave the invoking user's
 * real `~/.claude.json` untouched -- confirmed by mtime before/after a
 * probe `mcp add` under an isolated directory, not assumed from the flag's
 * name).
 *
 * `claude mcp login` (which opens a system browser and blocks on a human)
 * is deliberately never invoked -- see `printManualCompletionSteps` for
 * the exact commands to finish that step by hand. The connector is always
 * removed, in a `finally`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	checkDiscoveryDocumentsForConnectorCompatibility,
	commandIsAvailable,
	fetchDiscoveryDocuments,
	printManualCompletionSteps,
	runCli,
} from './connector-smoke-support';

function parseHostArgument(argv: readonly string[]): string | undefined {
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
		console.log(`[connector-smoke-claude-code] targeting ${baseUrl} (not self-hosted)`);
	} else {
		console.log('[connector-smoke-claude-code] no --host given; self-hosting this server locally');
		const local = await selfHostLocally();
		baseUrl = local.baseUrl;
		stopLocalServer = local.stop;
		console.log(`[connector-smoke-claude-code] self-hosted at ${baseUrl}`);
	}

	const problems: string[] = [];
	let claudeConfigDirectory: string | undefined;

	try {
		if (!commandIsAvailable('claude')) {
			throw new Error(
				'`claude` is not on PATH. Install Claude Code, then re-run: bun run test:connector:claude-code',
			);
		}
		const versionResult = await runCli('claude', ['--version'], { timeoutMs: 10_000 });
		console.log(`[connector-smoke-claude-code] claude --version -> ${versionResult.stdout.trim()}`);

		console.log('[connector-smoke-claude-code] fetching discovery documents...');
		const documents = await fetchDiscoveryDocuments(baseUrl);
		const discoveryProblems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		if (discoveryProblems.length > 0) {
			problems.push(...discoveryProblems.map((problem) => `discovery: ${problem}`));
		} else {
			console.log(
				'[connector-smoke-claude-code] discovery documents match Claude Code CLI expectations',
			);
		}

		// An isolated CLAUDE_CONFIG_DIR so this harness can never read,
		// write, or pollute the invoking user's real `~/.claude.json`.
		claudeConfigDirectory = await mkdtemp(join(tmpdir(), 'protokit-claude-code-smoke-'));
		const serverName = `protokit-interop-smoke-${randomUUID().slice(0, 8)}`;
		const isolatedEnvironment = { CLAUDE_CONFIG_DIR: claudeConfigDirectory };

		console.log(
			`[connector-smoke-claude-code] claude mcp add --transport http ${serverName} ${baseUrl}/mcp`,
		);
		const addResult = await runCli(
			'claude',
			['mcp', 'add', '--transport', 'http', serverName, `${baseUrl}/mcp`, '-s', 'local'],
			{ env: isolatedEnvironment, timeoutMs: 15_000 },
		);
		if (addResult.exitCode !== 0 || addResult.timedOut) {
			problems.push(
				`claude mcp add exited ${addResult.exitCode} (timedOut=${addResult.timedOut}): ${addResult.stderr || addResult.stdout}`,
			);
		} else {
			const getResult = await runCli('claude', ['mcp', 'get', serverName], {
				env: isolatedEnvironment,
				timeoutMs: 15_000,
			});
			if (getResult.exitCode !== 0 || !getResult.stdout.includes(`${baseUrl}/mcp`)) {
				problems.push(
					`claude mcp get did not confirm the registered server: ${getResult.stdout} ${getResult.stderr}`,
				);
			} else {
				console.log('[connector-smoke-claude-code] claude mcp get confirms registration');
			}

			await runCli('claude', ['mcp', 'remove', serverName, '-s', 'local'], {
				env: isolatedEnvironment,
				timeoutMs: 15_000,
			});
		}

		printManualCompletionSteps({
			cliLabel: 'Claude Code',
			serverName,
			baseUrl,
			addCommand: `claude mcp add --transport http ${serverName} ${baseUrl}/mcp`,
			loginCommand: `claude mcp login ${serverName}`,
			toolInvocationExample: `claude -p "use the ${serverName} MCP server's get_user_profile tool"`,
		});
	} finally {
		stopLocalServer?.();
		if (claudeConfigDirectory) {
			await rm(claudeConfigDirectory, { recursive: true, force: true });
		}
	}

	if (problems.length > 0) {
		console.error('');
		console.error('[connector-smoke-claude-code] FAILED:');
		for (const problem of problems) {
			console.error(`  - ${problem}`);
		}
		process.exit(1);
	}

	console.log('');
	console.log('[connector-smoke-claude-code] every automatable step passed.');

	// Standalone script, not `bun test`: nothing tears down the module-level
	// database/Redis clients `@web/application` opened, so without an explicit
	// exit the process hangs indefinitely after this line (confirmed
	// empirically -- it does not exit on its own).
	process.exit(0);
}

await main();
