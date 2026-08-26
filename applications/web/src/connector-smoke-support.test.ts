import { describe, expect, it } from 'bun:test';
import {
	checkDiscoveryDocumentsForConnectorCompatibility,
	commandIsAvailable,
	type DiscoveryDocuments,
	extractAndValidateAuthorizeUrl,
	fetchDiscoveryDocuments,
	printManualCompletionSteps,
	runCli,
} from '@web/connector-smoke-support';

/**
 * `connector-smoke-support.ts` is deliberately host-agnostic, pure, and
 * free of any `@web/env` import (see the file's own header comment), so
 * every function here is directly and fully testable with no server, no
 * database, and no mocking of this codebase's own modules.
 */

describe('runCli', () => {
	it('captures stdout, exit code, and timedOut for a fast, successful command', async () => {
		const result = await runCli('echo', ['hello from runCli']);
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('hello from runCli');
		expect(result.timedOut).toBe(false);
	});

	it('captures a nonzero exit code without stdout for a failing command', async () => {
		const result = await runCli('bash', ['-c', 'exit 3']);
		expect(result.exitCode).toBe(3);
		expect(result.timedOut).toBe(false);
	});

	it('captures stderr separately from stdout', async () => {
		const result = await runCli('bash', ['-c', 'echo out-text; echo err-text 1>&2']);
		expect(result.stdout).toContain('out-text');
		expect(result.stderr).toContain('err-text');
		expect(result.stdout).not.toContain('err-text');
	});

	it('kills a command that exceeds the timeout and reports timedOut', async () => {
		const result = await runCli('sleep', ['5'], { timeoutMs: 100 });
		expect(result.timedOut).toBe(true);
		// A killed process's exit code is platform-dependent (often null or a
		// signal-derived nonzero value) -- what matters is that it is not the
		// success code and that the call itself resolved rather than hanging.
		expect(result.exitCode).not.toBe(0);
	}, 10_000);

	it('passes through extra environment variables to the child process', async () => {
		const result = await runCli('bash', ['-c', 'echo "$RUN_CLI_TEST_MARKER"'], {
			env: { RUN_CLI_TEST_MARKER: 'marker-value-12345' },
		});
		expect(result.stdout).toContain('marker-value-12345');
	});
});

describe('commandIsAvailable', () => {
	it('returns true for a command that genuinely exists on PATH', () => {
		expect(commandIsAvailable('bun')).toBe(true);
	});

	it('returns false for a command that does not exist', () => {
		expect(commandIsAvailable('definitely-not-a-real-command-xyz-12345')).toBe(false);
	});

	it('returns false rather than throwing when Bun.spawnSync itself throws', () => {
		// A NUL byte makes `Bun.spawnSync` throw synchronously (a TypeError
		// about null bytes in an argument) before a subprocess is even
		// spawned -- proving the `catch` branch independent of the normal
		// "command not found" (`exitCode !== 0`) path above.
		expect(commandIsAvailable('foo\0bar')).toBe(false);
	});
});

describe('fetchDiscoveryDocuments', () => {
	it('fetches and parses all three discovery documents from a real local server', async () => {
		const authorizationServerMetadata = { authorization_endpoint: 'https://example.com/authorize' };
		const protectedResourceMetadata = { resource: 'https://example.com/mcp' };
		const protectedResourceMcpMetadata = { resource: 'https://example.com/mcp' };

		const server = Bun.serve({
			port: 0,
			fetch(request) {
				const url = new URL(request.url);
				if (url.pathname === '/.well-known/oauth-authorization-server') {
					return Response.json(authorizationServerMetadata);
				}
				if (url.pathname === '/.well-known/oauth-protected-resource') {
					return Response.json(protectedResourceMetadata);
				}
				if (url.pathname === '/.well-known/oauth-protected-resource/mcp') {
					return Response.json(protectedResourceMcpMetadata);
				}
				return new Response('not found', { status: 404 });
			},
		});

		try {
			const baseUrl = `http://localhost:${server.port}`;
			const documents = await fetchDiscoveryDocuments(baseUrl);
			expect(documents.authorizationServerMetadata).toEqual(authorizationServerMetadata);
			expect(documents.protectedResourceMetadata).toEqual(protectedResourceMetadata);
			expect(documents.protectedResourceMcpMetadata).toEqual(protectedResourceMcpMetadata);
		} finally {
			server.stop(true);
		}
	});

	it('rejects when any discovery document responds with a non-200 status', async () => {
		const server = Bun.serve({
			port: 0,
			fetch(request) {
				const url = new URL(request.url);
				if (url.pathname === '/.well-known/oauth-authorization-server') {
					return new Response('server error', { status: 500 });
				}
				return Response.json({});
			},
		});

		try {
			const baseUrl = `http://localhost:${server.port}`;
			await expect(fetchDiscoveryDocuments(baseUrl)).rejects.toThrow(/responded 500/);
		} finally {
			server.stop(true);
		}
	});
});

describe('checkDiscoveryDocumentsForConnectorCompatibility', () => {
	// `DiscoveryDocuments`'s three top-level fields are `readonly` (the
	// production type checked and validated is never meant to be mutated by
	// its own consumers) -- but these tests deliberately construct MALFORMED
	// variants to exercise each validation branch, which needs a mutable
	// local type. `MutableDiscoveryDocuments` strips exactly that readonly
	// modifier, only in this test file, never touching the production type.
	type MutableDiscoveryDocuments = {
		-readonly [Key in keyof DiscoveryDocuments]: DiscoveryDocuments[Key];
	};

	function compliantDocuments(): MutableDiscoveryDocuments {
		return {
			authorizationServerMetadata: {
				authorization_endpoint: 'https://example.com/authorize',
				token_endpoint: 'https://example.com/token',
				registration_endpoint: 'https://example.com/register',
				response_types_supported: ['code'],
				grant_types_supported: ['authorization_code', 'refresh_token'],
				code_challenge_methods_supported: ['S256'],
				client_id_metadata_document_supported: true,
			},
			protectedResourceMetadata: {
				resource: 'https://example.com/mcp',
				authorization_servers: ['https://example.com'],
			},
			protectedResourceMcpMetadata: {
				resource: 'https://example.com/mcp',
			},
		};
	}

	it('reports no problems for a fully compliant set of discovery documents', () => {
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(compliantDocuments());
		expect(problems).toEqual([]);
	});

	it('reports a missing authorization_endpoint', () => {
		const documents = compliantDocuments();
		const { authorization_endpoint: _removed, ...rest } = documents.authorizationServerMetadata;
		void _removed;
		documents.authorizationServerMetadata = rest;
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(problems.some((problem) => problem.includes('authorization_endpoint'))).toBe(true);
	});

	it('reports a missing token_endpoint', () => {
		const documents = compliantDocuments();
		const { token_endpoint: _removed, ...rest } = documents.authorizationServerMetadata;
		void _removed;
		documents.authorizationServerMetadata = rest;
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(problems.some((problem) => problem.includes('token_endpoint'))).toBe(true);
	});

	it('reports a missing registration_endpoint', () => {
		const documents = compliantDocuments();
		const { registration_endpoint: _removed, ...rest } = documents.authorizationServerMetadata;
		void _removed;
		documents.authorizationServerMetadata = rest;
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(problems.some((problem) => problem.includes('registration_endpoint'))).toBe(true);
	});

	it('reports response_types_supported missing "code"', () => {
		const documents = compliantDocuments();
		documents.authorizationServerMetadata = {
			...documents.authorizationServerMetadata,
			response_types_supported: ['token'],
		};
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(
			problems.some(
				(problem) => problem.includes('response_types_supported') && problem.includes('code'),
			),
		).toBe(true);
	});

	it('reports response_types_supported not being an array at all', () => {
		const documents = compliantDocuments();
		documents.authorizationServerMetadata = {
			...documents.authorizationServerMetadata,
			response_types_supported: 'code',
		};
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(problems.some((problem) => problem.includes('response_types_supported'))).toBe(true);
	});

	it('reports grant_types_supported missing authorization_code', () => {
		const documents = compliantDocuments();
		documents.authorizationServerMetadata = {
			...documents.authorizationServerMetadata,
			grant_types_supported: ['refresh_token'],
		};
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(
			problems.some(
				(problem) =>
					problem.includes('grant_types_supported') && problem.includes('authorization_code'),
			),
		).toBe(true);
	});

	it('reports grant_types_supported missing refresh_token', () => {
		const documents = compliantDocuments();
		documents.authorizationServerMetadata = {
			...documents.authorizationServerMetadata,
			grant_types_supported: ['authorization_code'],
		};
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(
			problems.some(
				(problem) => problem.includes('grant_types_supported') && problem.includes('refresh_token'),
			),
		).toBe(true);
	});

	it('reports code_challenge_methods_supported missing S256', () => {
		const documents = compliantDocuments();
		documents.authorizationServerMetadata = {
			...documents.authorizationServerMetadata,
			code_challenge_methods_supported: ['plain'],
		};
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(
			problems.some(
				(problem) =>
					problem.includes('code_challenge_methods_supported') && problem.includes('S256'),
			),
		).toBe(true);
	});

	it('reports client_id_metadata_document_supported not being exactly true', () => {
		const documents = compliantDocuments();
		documents.authorizationServerMetadata = {
			...documents.authorizationServerMetadata,
			client_id_metadata_document_supported: 'yes',
		};
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(problems.some((problem) => problem.includes('CIMD'))).toBe(true);
	});

	it('reports a missing protected resource "resource" field', () => {
		const documents = compliantDocuments();
		const { resource: _removed, ...rest } = documents.protectedResourceMetadata;
		void _removed;
		documents.protectedResourceMetadata = rest;
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(
			problems.some(
				(problem) =>
					problem.includes('protected resource metadata') && problem.includes('resource'),
			),
		).toBe(true);
	});

	it('reports a missing protected resource "authorization_servers" field', () => {
		const documents = compliantDocuments();
		const { authorization_servers: _removed, ...rest } = documents.protectedResourceMetadata;
		void _removed;
		documents.protectedResourceMetadata = rest;
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(problems.some((problem) => problem.includes('authorization_servers'))).toBe(true);
	});

	it('reports a protected resource "resource" that does not identify the /mcp endpoint', () => {
		const documents = compliantDocuments();
		documents.protectedResourceMetadata = {
			...documents.protectedResourceMetadata,
			resource: 'https://example.com/not-mcp',
		};
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(problems.some((problem) => problem.includes('/mcp endpoint'))).toBe(true);
	});

	it('reports a missing protected resource MCP metadata "resource" field', () => {
		const documents = compliantDocuments();
		documents.protectedResourceMcpMetadata = {};
		const problems = checkDiscoveryDocumentsForConnectorCompatibility(documents);
		expect(
			problems.some(
				(problem) =>
					problem.includes('protected resource MCP metadata') && problem.includes('resource'),
			),
		).toBe(true);
	});

	it('reports every problem at once for a document missing everything', () => {
		const problems = checkDiscoveryDocumentsForConnectorCompatibility({
			authorizationServerMetadata: {},
			protectedResourceMetadata: {},
			protectedResourceMcpMetadata: {},
		});
		// authorization_endpoint, token_endpoint, registration_endpoint,
		// response_types_supported, grant_types_supported (x2), CIMD,
		// code_challenge_methods_supported, resource, authorization_servers,
		// protected resource MCP metadata resource.
		expect(problems.length).toBeGreaterThanOrEqual(9);
	});
});

describe('extractAndValidateAuthorizeUrl', () => {
	const baseUrl = 'https://app.example.com';

	function validAuthorizeUrl(): string {
		return (
			`${baseUrl}/oauth/authorize?response_type=code&code_challenge=abc123` +
			`&code_challenge_method=S256&scope=mcp&resource=${encodeURIComponent(`${baseUrl}/mcp`)}` +
			`&client_id=connector-client`
		);
	}

	it('returns null when no authorize URL is present in the combined output', () => {
		const result = extractAndValidateAuthorizeUrl('nothing relevant here', baseUrl);
		expect(result).toBeNull();
	});

	it('extracts a fully valid authorize URL with no problems', () => {
		const output = `Visit this URL to continue:\n${validAuthorizeUrl()}\n`;
		const result = extractAndValidateAuthorizeUrl(output, baseUrl);
		expect(result).not.toBeNull();
		expect(result?.problems).toEqual([]);
		expect(result?.url).toContain('/oauth/authorize?');
	});

	it('reports response_type not being "code"', () => {
		const url = validAuthorizeUrl().replace('response_type=code', 'response_type=token');
		const result = extractAndValidateAuthorizeUrl(url, baseUrl);
		expect(result?.problems.some((problem) => problem.includes('response_type'))).toBe(true);
	});

	it('reports code_challenge_method not being "S256"', () => {
		const url = validAuthorizeUrl().replace(
			'code_challenge_method=S256',
			'code_challenge_method=plain',
		);
		const result = extractAndValidateAuthorizeUrl(url, baseUrl);
		expect(result?.problems.some((problem) => problem.includes('code_challenge_method'))).toBe(
			true,
		);
	});

	it('reports a missing code_challenge', () => {
		const url = validAuthorizeUrl().replace('&code_challenge=abc123', '');
		const result = extractAndValidateAuthorizeUrl(url, baseUrl);
		expect(result?.problems.some((problem) => problem.includes('code_challenge'))).toBe(true);
	});

	it('reports a missing scope', () => {
		const url = validAuthorizeUrl().replace('&scope=mcp', '');
		const result = extractAndValidateAuthorizeUrl(url, baseUrl);
		expect(result?.problems.some((problem) => problem.includes('scope'))).toBe(true);
	});

	it("reports a resource that does not match this server's /mcp endpoint", () => {
		const url = validAuthorizeUrl().replace(
			`resource=${encodeURIComponent(`${baseUrl}/mcp`)}`,
			`resource=${encodeURIComponent('https://evil.example.com/mcp')}`,
		);
		const result = extractAndValidateAuthorizeUrl(url, baseUrl);
		expect(result?.problems.some((problem) => problem.includes('resource'))).toBe(true);
	});

	it('reports a missing client_id', () => {
		const url = validAuthorizeUrl().replace('&client_id=connector-client', '');
		const result = extractAndValidateAuthorizeUrl(url, baseUrl);
		expect(result?.problems.some((problem) => problem.includes('client_id'))).toBe(true);
	});

	it('reports every problem at once for a maximally broken authorize URL', () => {
		const url = `${baseUrl}/oauth/authorize?foo=bar`;
		const result = extractAndValidateAuthorizeUrl(url, baseUrl);
		expect(result).not.toBeNull();
		expect(result?.problems.length).toBeGreaterThanOrEqual(5);
	});
});

describe('printManualCompletionSteps', () => {
	it('does not throw for Codex CLI', () => {
		expect(() =>
			printManualCompletionSteps({
				cliLabel: 'Codex CLI',
				serverName: 'test-server',
				baseUrl: 'https://app.example.com',
				addCommand: 'codex mcp add test-server https://app.example.com/mcp',
				loginCommand: 'codex mcp login test-server',
				toolInvocationExample: 'codex mcp call test-server some_tool',
			}),
		).not.toThrow();
	});

	it('does not throw for Claude Code, and its removal instructions differ from Codex', () => {
		const originalLog = console.log;
		const lines: string[] = [];
		console.log = (...arguments_: unknown[]) => {
			lines.push(arguments_.map(String).join(' '));
		};
		try {
			printManualCompletionSteps({
				cliLabel: 'Claude Code',
				serverName: 'test-server',
				baseUrl: 'https://app.example.com',
				addCommand: 'claude mcp add test-server https://app.example.com/mcp',
				loginCommand: 'claude mcp login test-server',
				toolInvocationExample: 'claude mcp call test-server some_tool',
			});
		} finally {
			console.log = originalLog;
		}
		expect(lines.some((line) => line.includes('claude mcp remove test-server'))).toBe(true);
	});
});

/**
 * `runHarnessMain` ends in `process.exit(1)`, so it cannot be exercised
 * in-process without either stubbing `process.exit` (which proves the stub
 * works, not the harness) or tearing down the test runner. A real subprocess
 * is the only way to assert what an operator actually sees, which is the
 * entire point of this function: pointing a deployed harness at a host that
 * does not resolve used to print a raw Bun stack trace through
 * `node_modules`. Same approach as `env-skip-validation-guard.test.ts`.
 */
describe('runHarnessMain', () => {
	async function runInSubprocess(body: string): Promise<{
		exitCode: number;
		stdout: string;
		stderr: string;
	}> {
		const modulePath = new URL('./connector-smoke-support.ts', import.meta.url).pathname;
		const script = `import { runHarnessMain } from ${JSON.stringify(modulePath)};\n${body}`;
		const subprocess = Bun.spawn(['bun', '-e', script], {
			stdout: 'pipe',
			stderr: 'pipe',
			env: { ...process.env, NODE_ENV: 'test' },
		});
		const [stdout, stderr] = await Promise.all([
			new Response(subprocess.stdout).text(),
			new Response(subprocess.stderr).text(),
		]);
		return { exitCode: await subprocess.exited, stdout, stderr };
	}

	it('exits 0 and prints nothing extra when main succeeds', async () => {
		const result = await runInSubprocess(
			`await runHarnessMain('probe', async () => { console.log('ran'); });`,
		);

		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain('ran');
		expect(result.stderr).not.toContain('failed:');
	});

	it("reports a thrown Error's message and exits 1, with no stack trace", async () => {
		const result = await runInSubprocess(
			`await runHarnessMain('probe', async () => { throw new Error('Unable to connect'); });`,
		);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('[probe] failed: Unable to connect');
		expect(result.stderr).toContain('the host is unreachable');
		// The defect this exists to prevent: a raw trace through node_modules.
		expect(result.stderr).not.toContain('node_modules');
		expect(result.stderr).not.toContain('    at ');
	});

	it('describes a non-Error throw instead of printing [object Object]', async () => {
		const result = await runInSubprocess(
			`await runHarnessMain('probe', async () => { throw 'plain string failure'; });`,
		);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain('[probe] failed: plain string failure');
	});

	it('labels the failure with the harness name it was given', async () => {
		const result = await runInSubprocess(
			`await runHarnessMain('deployed-oauth', async () => { throw new Error('boom'); });`,
		);

		expect(result.stderr).toContain('[deployed-oauth] failed: boom');
	});
});
