import { describe, expect, it } from 'bun:test';
import { getEnvironment, parseMcpServerEnvironment } from './env.js';

/**
 * This file replaces a previous version whose assertions this change
 * deliberately inverts. Recorded here rather than silently dropped.
 *
 * What it asserted: that importing `env.ts` with `SKIP_ENV_VALIDATION`
 * set, or with `LOG_CONTENT_DIAGNOSTICS_UNTIL` set under
 * `NODE_ENV=production`, killed the process — `expect(exitCode).not.toBe(0)`
 * from a `Bun.spawn` subprocess. That was the correct test for the
 * contract at the time: both guards ran at module scope, so a bad
 * environment had to take the import down.
 *
 * Why the new behaviour is correct: TRI-75 makes importing this package
 * side-effect-free, because a library that validates the host's
 * environment during module evaluation cannot be consumed — the host
 * cannot catch it, cannot supply a different environment, and cannot even
 * decide whether it wants a server. So "import throws" is no longer the
 * property to want, and asserting it would now be asserting the bug.
 *
 * What is NOT lost: both guards still fire, and each test below fails if
 * its guard is deleted. The enforcement point moved from module load to
 * `parseMcpServerEnvironment`, so the tests moved with it, from
 * subprocess exit codes to direct calls. The inverted half of the old
 * contract — that importing now *succeeds* under a hostile environment —
 * is covered in `import-side-effects.test.ts`, which still uses a real
 * subprocess because that property genuinely cannot be observed in-process
 * once the module is cached.
 *
 * One thing the old file documented is genuinely gone: its note that the
 * module-scope guard lines were an unclosable coverage gap under Bun's
 * `--coverage` collector. They are ordinary covered lines now, because
 * they live inside a function a test can call directly.
 */

const validEnvironment = { NODE_ENV: 'test', MCP_SERVER_NAME: 'protokit-mcp-server' } as const;

describe('parseMcpServerEnvironment', () => {
	it('parses a minimal valid environment and applies schema defaults', () => {
		const environment = parseMcpServerEnvironment({ ...validEnvironment });
		expect(environment.NODE_ENV).toBe('test');
		expect(environment.MCP_SERVER_NAME).toBe('protokit-mcp-server');
		expect(environment.MCP_CONFORMANCE_MODE).toBe(false);
		expect(environment.LOG_LEVEL).toBe('info');
	});

	it('rejects an environment missing the required NODE_ENV', () => {
		expect(() => parseMcpServerEnvironment({ MCP_SERVER_NAME: 'protokit-mcp-server' })).toThrow(
			/NODE_ENV/,
		);
	});

	it('rejects a missing MCP_SERVER_NAME at parse time with the variable name', () => {
		expect(() => parseMcpServerEnvironment({ NODE_ENV: 'test' })).toThrow(/MCP_SERVER_NAME/);
	});

	it('rejects an invalid enum value rather than coercing it', () => {
		expect(() =>
			parseMcpServerEnvironment({ ...validEnvironment, MCP_CONFORMANCE_MODE: 'yes' }),
		).toThrow();
	});

	/**
	 * CONFIG-001 / BUG-001. A declared-but-blank variable must behave
	 * exactly like one that was never set, so it reaches `.default()`
	 * instead of failing `.min(1)` or coercing to a falsy value.
	 */
	it('treats an empty required string as missing and rejects it', () => {
		expect(() =>
			parseMcpServerEnvironment({
				...validEnvironment,
				MCP_SERVER_NAME: '',
			}),
		).toThrow(/MCP_SERVER_NAME/);
	});

	/**
	 * CONFIG-001 / BUG-001 guard, relocated from module scope into this
	 * function. Fails when the `SKIP_ENV_VALIDATION` check is removed: with
	 * the guard gone the call returns a parsed environment instead of
	 * throwing, because the variable is not part of the schema and is
	 * simply ignored.
	 */
	it('refuses SKIP_ENV_VALIDATION outright, in every NODE_ENV', () => {
		for (const nodeEnv of ['development', 'production', 'test'] as const) {
			expect(() =>
				parseMcpServerEnvironment({ NODE_ENV: nodeEnv, SKIP_ENV_VALIDATION: '1' }),
			).toThrow(/SKIP_ENV_VALIDATION is not supported/);
		}
	});

	/**
	 * OBS-001 guard, likewise relocated. Fails when the production refusal
	 * is removed: the timestamp is schema-valid on its own, so without the
	 * imperative check the parse succeeds and production silently permits
	 * raw prompt-content logging.
	 */
	it('refuses LOG_CONTENT_DIAGNOSTICS_UNTIL in production', () => {
		expect(() =>
			parseMcpServerEnvironment({
				MCP_SERVER_NAME: 'protokit-mcp-server',
				NODE_ENV: 'production',
				LOG_CONTENT_DIAGNOSTICS_UNTIL: '2030-01-01T00:00:00Z',
			}),
		).toThrow(/cannot run in production/);
	});

	it('permits LOG_CONTENT_DIAGNOSTICS_UNTIL outside production', () => {
		for (const nodeEnv of ['development', 'test'] as const) {
			const environment = parseMcpServerEnvironment({
				MCP_SERVER_NAME: 'protokit-mcp-server',
				NODE_ENV: nodeEnv,
				LOG_CONTENT_DIAGNOSTICS_UNTIL: '2030-01-01T00:00:00Z',
			});
			expect(environment.LOG_CONTENT_DIAGNOSTICS_UNTIL).toBe('2030-01-01T00:00:00Z');
		}
	});

	it('reads only the record it is given, never process.env', () => {
		const sentinel = 'sentinel-server-name-not-in-process-env';
		const originalServerName = process.env.MCP_SERVER_NAME;
		process.env.MCP_SERVER_NAME = sentinel;
		try {
			const environment = parseMcpServerEnvironment({ ...validEnvironment });
			expect(environment.MCP_SERVER_NAME).not.toBe(sentinel);
			expect(environment.MCP_SERVER_NAME).toBe('protokit-mcp-server');
		} finally {
			if (originalServerName === undefined) delete process.env.MCP_SERVER_NAME;
			else process.env.MCP_SERVER_NAME = originalServerName;
		}
	});
});

describe('getEnvironment', () => {
	it('memoizes, returning the identical object across calls', () => {
		expect(getEnvironment()).toBe(getEnvironment());
	});

	it('returns a validated environment reflecting the test runner NODE_ENV', () => {
		expect(getEnvironment().NODE_ENV).toBe('test');
	});
});
