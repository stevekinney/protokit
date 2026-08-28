import { afterEach, describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { neonConfig } from '@neondatabase/serverless';

import {
	evaluateDatabaseConnection,
	evaluateEnvironmentSchema,
	evaluateEnvironmentSchemas,
	evaluateMcpProductionProhibitions,
	evaluateProductionReadiness,
	evaluateRedisConnection,
	loadCandidateVariables,
	parseArguments,
	parseGithubSecretNames,
	resolveTarget,
	summarize,
	type CandidateVariables,
} from './doctor.ts';

/** A fully valid configuration for every package's schema and every production invariant. */
function validVariables(): CandidateVariables {
	return {
		NODE_ENV: 'production',
		DATABASE_URL:
			'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=verify-full',
		BASE_URL: 'https://app.example.com',
		REDIS_URL: 'rediss://production-redis.example.com:6380',
		TRUSTED_PROXY_CIDRS: '10.0.0.0/8',
		TRUSTED_PROXY_HEADER: 'x-forwarded-for',
		SESSION_SIGNING_SECRET: 'a'.repeat(32),
		GOOGLE_CLIENT_ID: 'client-id',
		GOOGLE_CLIENT_SECRET: 'client-secret',
	};
}

describe('evaluateEnvironmentSchema', () => {
	it('reports a schema-required field as a failure when it is missing — with no doctor.ts edit needed to notice a new required field', () => {
		const results = evaluateEnvironmentSchema(
			'test-schema',
			{ REQUIRED_FIELD: z.string().min(1) },
			{},
		);
		expect(results).toHaveLength(1);
		expect(results[0]?.status).toBe('fail');
		expect(results[0]?.label).toBe('REQUIRED_FIELD');
	});

	it('reports a schema-required field as passing once it is present', () => {
		const results = evaluateEnvironmentSchema(
			'test-schema',
			{ REQUIRED_FIELD: z.string().min(1) },
			{ REQUIRED_FIELD: 'present' },
		);
		expect(results).toHaveLength(1);
		expect(results[0]?.status).toBe('pass');
	});

	it('never includes the offending value in a failure message', () => {
		const results = evaluateEnvironmentSchema(
			'test-schema',
			{ SECRET: z.string().min(32) },
			{ SECRET: 'this-secret-value-is-too-short' },
		);
		const joined = results.map((entry) => entry.detail).join('\n');
		expect(joined).not.toContain('this-secret-value-is-too-short');
	});

	it('does not fail an optional field with a default when it is absent', () => {
		const results = evaluateEnvironmentSchema(
			'test-schema',
			{ OPTIONAL_WITH_DEFAULT: z.string().optional().default('fallback') },
			{},
		);
		expect(results.every((entry) => entry.status !== 'fail')).toBe(true);
	});

	it('does not fail a genuinely optional field when it is absent', () => {
		const results = evaluateEnvironmentSchema(
			'test-schema',
			{ OPTIONAL_FIELD: z.string().optional() },
			{},
		);
		expect(results.every((entry) => entry.status !== 'fail')).toBe(true);
	});
});

describe('evaluateEnvironmentSchemas — real package schemas', () => {
	it('fails when a real package schema-required variable (NODE_ENV) is missing, with no edit to scripts/doctor.ts', () => {
		const variables = validVariables();
		delete variables.NODE_ENV;
		const results = evaluateEnvironmentSchemas(variables);
		const nodeEnvFailures = results.filter(
			(entry) => entry.status === 'fail' && entry.label === 'NODE_ENV',
		);
		// NODE_ENV is required in both @lostgradient/mcp's and @template/web's schema.
		expect(nodeEnvFailures.length).toBeGreaterThanOrEqual(2);
	});

	it('fails when DATABASE_URL (a real package schema-required variable) is missing', () => {
		const variables = validVariables();
		delete variables.DATABASE_URL;
		const results = evaluateEnvironmentSchemas(variables);
		expect(results.some((entry) => entry.status === 'fail' && entry.label === 'DATABASE_URL')).toBe(
			true,
		);
	});

	it('passes every schema for a fully valid configuration', () => {
		const results = evaluateEnvironmentSchemas(validVariables());
		expect(results.every((entry) => entry.status !== 'fail')).toBe(true);
	});
});

describe('evaluateProductionReadiness', () => {
	it('reports nothing for the development target, even with an empty configuration', () => {
		expect(evaluateProductionReadiness('development', {})).toEqual([]);
	});

	it('skips (does not silently pass) when DATABASE_URL is entirely absent', () => {
		const variables = validVariables();
		delete variables.DATABASE_URL;
		const results = evaluateProductionReadiness('production', variables);
		expect(results).toHaveLength(1);
		expect(results[0]?.status).toBe('skip');
	});

	it('fails when the shared atomic rate limiter (REDIS_URL) is absent', () => {
		const variables = validVariables();
		delete variables.REDIS_URL;
		const results = evaluateProductionReadiness('production', variables);
		expect(
			results.some(
				(entry) => entry.status === 'fail' && entry.detail.includes('REDIS_URL is not set'),
			),
		).toBe(true);
	});

	it('fails when development authentication would remain enabled (NODE_ENV is not "production")', () => {
		const variables = { ...validVariables(), NODE_ENV: 'development' };
		const results = evaluateProductionReadiness('production', variables);
		expect(
			results.some(
				(entry) =>
					entry.status === 'fail' && entry.detail.includes('development-only authentication route'),
			),
		).toBe(true);
	});

	it('fails when trusted-proxy configuration is missing', () => {
		const variables = validVariables();
		delete variables.TRUSTED_PROXY_CIDRS;
		delete variables.TRUSTED_PROXY_HEADER;
		const results = evaluateProductionReadiness('production', variables);
		expect(
			results.some(
				(entry) => entry.status === 'fail' && entry.detail.includes('TRUSTED_PROXY_CIDRS'),
			),
		).toBe(true);
	});

	it('fails when BASE_URL is not set', () => {
		const variables = validVariables();
		delete variables.BASE_URL;
		const results = evaluateProductionReadiness('production', variables);
		expect(results.some((entry) => entry.detail.includes('BASE_URL is not set'))).toBe(true);
	});

	it('fails when Google credentials are only half configured', () => {
		const variables = validVariables();
		delete variables.GOOGLE_CLIENT_SECRET;
		const results = evaluateProductionReadiness('production', variables);
		expect(
			results.some((entry) =>
				entry.detail.includes('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set'),
			),
		).toBe(true);
	});

	// Review round 4 / P1: production has no other authentication provider —
	// `/auth/dev/login` is disabled outside development and an
	// unauthenticated `/oauth/authorize` request redirects to
	// `/auth/google/start`, which 503s with no Google credentials configured.
	it('fails when both Google credentials are absent', () => {
		const variables = validVariables();
		delete variables.GOOGLE_CLIENT_ID;
		delete variables.GOOGLE_CLIENT_SECRET;
		const results = evaluateProductionReadiness('production', variables);
		expect(
			results.some((entry) =>
				entry.detail.includes('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set'),
			),
		).toBe(true);
	});

	it('never includes a raw credential value in a failure message', () => {
		const variables = validVariables();
		variables.REDIS_URL = 'rediss://admin:admin@production-redis.example.com:6380';
		variables.DATABASE_URL =
			'postgresql://root:root@production-host.example.com:5432/app?sslmode=verify-full';
		const results = evaluateProductionReadiness('production', variables);
		const joined = results.map((entry) => entry.detail).join('\n');
		expect(joined).not.toContain('admin:admin');
		expect(joined).not.toContain('root:root');
	});

	it('fails when DATABASE_URL only encrypts (sslmode=require) without verifying the certificate', () => {
		const variables = validVariables();
		variables.DATABASE_URL =
			'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=require';
		const results = evaluateProductionReadiness('production', variables);
		expect(results.some((entry) => entry.detail.includes('sslmode=verify-full'))).toBe(true);
	});

	it('fails when NODE_TLS_REJECT_UNAUTHORIZED=0 disables certificate validation process-wide', () => {
		const variables = validVariables();
		variables.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		const results = evaluateProductionReadiness('production', variables);
		expect(results.some((entry) => entry.detail.includes('NODE_TLS_REJECT_UNAUTHORIZED=0'))).toBe(
			true,
		);
	});

	it('fails when SESSION_SIGNING_SECRET is absent even though every other production variable is valid (resolveSessionSigningSecrets() refuses to start production without it)', () => {
		const variables = validVariables();
		delete variables.SESSION_SIGNING_SECRET;
		const results = evaluateProductionReadiness('production', variables);
		expect(
			results.some(
				(entry) => entry.status === 'fail' && entry.detail.includes('SESSION_SIGNING_SECRET'),
			),
		).toBe(true);
		expect(results.some((entry) => entry.detail === 'All satisfied')).toBe(false);
	});

	it('passes with no failures for a fully valid production configuration', () => {
		const results = evaluateProductionReadiness('production', validVariables());
		expect(results).toEqual([
			{
				status: 'pass',
				label: 'Production startup invariants',
				detail: 'All satisfied',
				group: 'Production readiness',
			},
		]);
	});

	it('fails when MCP_CONFORMANCE_MODE=true — the synthetic conformance registry must never reach production (review round 4)', () => {
		const variables = { ...validVariables(), MCP_CONFORMANCE_MODE: 'true' };
		const results = evaluateProductionReadiness('production', variables);
		expect(
			results.some(
				(entry) => entry.status === 'fail' && entry.detail.includes('MCP_CONFORMANCE_MODE is true'),
			),
		).toBe(true);
	});

	it('passes when MCP_CONFORMANCE_MODE=false, matching the schema default', () => {
		const variables = { ...validVariables(), MCP_CONFORMANCE_MODE: 'false' };
		const results = evaluateProductionReadiness('production', variables);
		expect(results.some((entry) => entry.status === 'fail')).toBe(false);
	});

	// Round-16 review-thread claim on `applications/web/src/lib/mcp-origin-validation.ts:57`:
	// a malformed `MCP_ALLOWED_ORIGINS` entry used to be silently dropped
	// rather than rejected or reported, so `doctor` never caught it and
	// production could start successfully with an allow-list matching
	// nothing. `evaluateProductionReadiness` is what `doctor` actually runs
	// for `--production`, so this is the real regression test for the
	// operator-visible half of that finding.
	it('fails when MCP_ALLOWED_ORIGINS is entirely made of entries that cannot be canonicalized to a browser Origin', () => {
		const variables = { ...validVariables(), MCP_ALLOWED_ORIGINS: 'https://claude.ai/callback' };
		const results = evaluateProductionReadiness('production', variables);
		expect(
			results.some(
				(entry) => entry.status === 'fail' && entry.detail.includes('MCP_ALLOWED_ORIGINS'),
			),
		).toBe(true);
	});

	it('passes when every MCP_ALLOWED_ORIGINS entry canonicalizes cleanly', () => {
		const variables = {
			...validVariables(),
			MCP_ALLOWED_ORIGINS: 'https://claude.ai,http://localhost:3000',
		};
		const results = evaluateProductionReadiness('production', variables);
		expect(results.some((entry) => entry.status === 'fail')).toBe(false);
	});
});

describe('evaluateMcpProductionProhibitions', () => {
	it('reports nothing for the development target, even with LOG_CONTENT_DIAGNOSTICS_UNTIL set', () => {
		expect(
			evaluateMcpProductionProhibitions('development', {
				LOG_CONTENT_DIAGNOSTICS_UNTIL: '2099-01-01T00:00:00Z',
			}),
		).toEqual([]);
	});

	it('reports nothing for the production target when LOG_CONTENT_DIAGNOSTICS_UNTIL is unset', () => {
		expect(evaluateMcpProductionProhibitions('production', validVariables())).toEqual([]);
	});

	// Regression for a bot-reported P2: a valid `LOG_CONTENT_DIAGNOSTICS_UNTIL` timestamp passes
	// the schema check (`z.iso.datetime()` doesn't know about NODE_ENV), but
	// `packages/mcp/src/env.ts` refuses to import at all in production regardless of the
	// timestamp value (OBS-001). Without this check, `doctor --production` reported a fully ready
	// configuration for an environment the real MCP server immediately refuses to start with.
	it('fails in production when LOG_CONTENT_DIAGNOSTICS_UNTIL is set, even to a valid future timestamp', () => {
		const variables = {
			...validVariables(),
			LOG_CONTENT_DIAGNOSTICS_UNTIL: '2099-01-01T00:00:00Z',
		};
		const results = evaluateMcpProductionProhibitions('production', variables);
		expect(results).toHaveLength(1);
		expect(results[0]?.status).toBe('fail');
		expect(results[0]?.detail).toContain('not supported in production');
	});
});

describe('summarize', () => {
	it('exits nonzero on failure', () => {
		const { failures } = summarize([
			{ status: 'fail', label: 'x', detail: 'x', group: 'x' },
			{ status: 'pass', label: 'y', detail: 'y', group: 'y' },
		]);
		expect(failures).toBeGreaterThan(0);
	});

	it('reports zero failures and zero warnings for a fully configured environment', () => {
		const results = [
			...evaluateEnvironmentSchemas(validVariables()),
			...evaluateProductionReadiness('production', validVariables()),
		];
		const { failures, warnings } = summarize(results);
		expect(failures).toBe(0);
		expect(warnings).toBe(0);
	});
});

describe('parseArguments', () => {
	it('parses --production', () => {
		expect(parseArguments(['--production'])).toEqual({
			target: 'production',
			subcommand: undefined,
		});
	});

	it('parses --development', () => {
		expect(parseArguments(['--development'])).toEqual({
			target: 'development',
			subcommand: undefined,
		});
	});

	it('parses a subcommand alongside a target flag', () => {
		expect(parseArguments(['--production', 'neon'])).toEqual({
			target: 'production',
			subcommand: 'neon',
		});
	});

	it('returns a null target when no flag is given', () => {
		expect(parseArguments([])).toEqual({ target: null, subcommand: undefined });
	});
});

describe('resolveTarget', () => {
	it('uses the explicit flag over NODE_ENV', () => {
		expect(resolveTarget('development', { NODE_ENV: 'production' })).toBe('development');
	});

	it('infers production from NODE_ENV when no flag is given', () => {
		expect(resolveTarget(null, { NODE_ENV: 'production' })).toBe('production');
	});

	it('infers development from any non-production NODE_ENV when no flag is given', () => {
		expect(resolveTarget(null, { NODE_ENV: 'test' })).toBe('development');
		expect(resolveTarget(null, {})).toBe('development');
	});
});

describe('loadCandidateVariables', () => {
	it("treats an empty-string process.env value as unset, matching every env.ts's emptyStringAsUndefined", () => {
		const originalValue = process.env.DX_001_EMPTY_STRING_TEST_VAR;
		process.env.DX_001_EMPTY_STRING_TEST_VAR = '';
		try {
			const variables = loadCandidateVariables();
			expect(variables.DX_001_EMPTY_STRING_TEST_VAR).toBeUndefined();
		} finally {
			if (originalValue === undefined) {
				delete process.env.DX_001_EMPTY_STRING_TEST_VAR;
			} else {
				process.env.DX_001_EMPTY_STRING_TEST_VAR = originalValue;
			}
		}
	});

	it('keeps a non-empty process.env value as-is', () => {
		const originalValue = process.env.DX_001_NON_EMPTY_TEST_VAR;
		process.env.DX_001_NON_EMPTY_TEST_VAR = 'present';
		try {
			const variables = loadCandidateVariables();
			expect(variables.DX_001_NON_EMPTY_TEST_VAR).toBe('present');
		} finally {
			if (originalValue === undefined) {
				delete process.env.DX_001_NON_EMPTY_TEST_VAR;
			} else {
				process.env.DX_001_NON_EMPTY_TEST_VAR = originalValue;
			}
		}
	});
});

describe('evaluateDatabaseConnection', () => {
	const originalFetchEndpoint = neonConfig.fetchEndpoint;

	afterEach(() => {
		neonConfig.fetchEndpoint = originalFetchEndpoint;
	});

	// Regression for a bot-reported P2: doctor previously constructed the Neon client with the
	// driver's default HTTPS endpoint resolution regardless of DATABASE_LOCAL_PROXY_URL, so
	// against the Docker-backed local Postgres setup it probed an endpoint the real application
	// (`packages/database/src/index.ts`) and migrator (`packages/database/src/migrate.ts`) never
	// actually talk to — reporting a false connection failure. Asserting the resulting
	// `neonConfig.fetchEndpoint` proves the same `applyLocalProxyFetchEndpoint` override those two
	// call sites use is applied here too, before the connection attempt.
	it('applies DATABASE_LOCAL_PROXY_URL to neonConfig.fetchEndpoint before connecting', async () => {
		await evaluateDatabaseConnection({
			DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
			DATABASE_LOCAL_PROXY_URL: 'http://db.localtest.me:4444/sql',
		});

		expect(neonConfig.fetchEndpoint).toBe('http://db.localtest.me:4444/sql');
	});

	it('leaves the driver default fetchEndpoint untouched when DATABASE_LOCAL_PROXY_URL is unset', async () => {
		await evaluateDatabaseConnection({
			DATABASE_URL: 'postgresql://user:pass@production-host.example.com:5432/db',
		});

		expect(neonConfig.fetchEndpoint).toBe(originalFetchEndpoint);
	});

	it('skips the connection attempt entirely (and never touches fetchEndpoint) when DATABASE_URL is unset', async () => {
		const results = await evaluateDatabaseConnection({});
		expect(results[0]?.status).toBe('skip');
		expect(neonConfig.fetchEndpoint).toBe(originalFetchEndpoint);
	});

	it('probes only DATABASE_URL, under its original unqualified label, when DATABASE_URL_UNPOOLED is unset', async () => {
		const results = await evaluateDatabaseConnection({
			DATABASE_URL: 'postgresql://user:pass@production-host.example.com:5432/db',
		});
		expect(results).toHaveLength(1);
		expect(results[0]?.label).toBe('Database connection');
	});

	// Regression for a bot-reported P2: packages/database/src/migrate.ts's runMigrations prefers
	// DATABASE_URL_UNPOOLED over DATABASE_URL when both are set. Previously doctor only ever
	// probed DATABASE_URL, so a stale/unreachable DATABASE_URL_UNPOOLED reported a fully green
	// "Database connection: Connected successfully" while the real migration step (run on every
	// deployment) still failed against the URL it actually uses. Both URLs must now be probed and
	// reported as two distinct, separately labeled results.
	it('probes both DATABASE_URL and DATABASE_URL_UNPOOLED as separate results when both are set', async () => {
		const results = await evaluateDatabaseConnection({
			DATABASE_URL: 'postgresql://user:pass@pooled-host.example.com:5432/db',
			DATABASE_URL_UNPOOLED: 'postgresql://user:pass@unpooled-host.example.com:5432/db',
		});
		expect(results).toHaveLength(2);
		expect(results[0]?.label).toBe('Database connection (pooled, DATABASE_URL)');
		expect(results[1]?.label).toBe(
			'Database connection (unpooled, DATABASE_URL_UNPOOLED — used for migrations)',
		);
	});

	it('applies DATABASE_LOCAL_PROXY_URL to the DATABASE_URL_UNPOOLED probe too', async () => {
		await evaluateDatabaseConnection({
			DATABASE_URL: 'postgresql://user:pass@pooled-host.example.com:5432/db',
			DATABASE_URL_UNPOOLED: 'postgresql://user:pass@unpooled-host.example.com:5432/db',
			DATABASE_LOCAL_PROXY_URL: 'http://db.localtest.me:4444/sql',
		});
		expect(neonConfig.fetchEndpoint).toBe('http://db.localtest.me:4444/sql');
	});

	// Regression for a bot-reported P2: this await previously had no deadline, so an endpoint
	// that accepts the connection but never answers `SELECT 1` (a wedged proxy, a stalled
	// connection pool) left doctor hanging forever instead of reporting a failed diagnostic.
	// A real local server that accepts every request and never responds reproduces exactly that
	// endpoint shape; without the `withDeadline` wrap this test times out instead of observing a
	// bounded `fail` result.
	it('bounds the database probe with a deadline instead of hanging on a connection that never answers', async () => {
		const server = Bun.serve({
			port: 0,
			fetch: () => new Promise<Response>(() => {}),
		});

		try {
			const startedAt = Date.now();
			const results = await evaluateDatabaseConnection({
				DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
				DATABASE_LOCAL_PROXY_URL: `http://localhost:${server.port}/sql`,
			});
			const elapsedMs = Date.now() - startedAt;

			expect(results).toHaveLength(1);
			expect(results[0]?.status).toBe('fail');
			expect(results[0]?.detail).toContain('Timed out');
			// The probe's own deadline is 5s -- assert it resolves well short of the 10s test
			// timeout below, proving the await was actually bounded rather than coincidentally
			// finishing before Bun's own default test timeout.
			expect(elapsedMs).toBeLessThan(8000);
		} finally {
			server.stop(true);
		}
	}, 10_000);
});

describe('evaluateRedisConnection', () => {
	it('skips the connection attempt entirely when REDIS_URL is unset', async () => {
		const results = await evaluateRedisConnection({});
		expect(results).toHaveLength(1);
		expect(results[0]?.status).toBe('skip');
	});

	// Regression for a bot-reported P2: doctor previously only validated the *shape* of
	// REDIS_URL (via collectProductionStartupFailures) and never actually connected, so a
	// well-formed but unreachable/stale Redis endpoint reported no failure even though
	// production rate limiting and the authenticated readiness route both depend on a live
	// connection. Pointing at a port nothing is listening on proves doctor now performs a real
	// connect+ping attempt and reports it as a failure, not a pass.
	it('fails when REDIS_URL points at an endpoint nothing is listening on', async () => {
		const results = await evaluateRedisConnection({
			REDIS_URL: 'redis://127.0.0.1:1',
		});
		expect(results).toHaveLength(1);
		expect(results[0]?.status).toBe('fail');
	}, 10_000);

	it('passes against a real, reachable Redis endpoint', async () => {
		const results = await evaluateRedisConnection({
			REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
		});
		expect(results).toHaveLength(1);
		expect(results[0]?.status).toBe('pass');
	});
});

describe('parseGithubSecretNames', () => {
	// Regression for a bot-reported P2: matching with `String.includes` against the raw `gh
	// secret list` output reported `DATABASE_URL` as configured whenever only the separate
	// `DATABASE_URL_UNPOOLED` secret existed, because `DATABASE_URL_UNPOOLED` necessarily
	// contains `DATABASE_URL` as a substring -- a false pass for a secret the deployment
	// workflows do not actually have.
	it('does not treat a longer secret name as satisfying a shorter name it merely contains', () => {
		const names = parseGithubSecretNames('DATABASE_URL_UNPOOLED\t2024-01-01T00:00:00Z\n');
		expect(names.has('DATABASE_URL_UNPOOLED')).toBe(true);
		expect(names.has('DATABASE_URL')).toBe(false);
	});

	it('parses the exact name from each tab-separated line, ignoring the update-date column', () => {
		const names = parseGithubSecretNames(
			'DATABASE_URL\t2024-01-01T00:00:00Z\nSESSION_SIGNING_SECRET\t2024-02-02T00:00:00Z\n',
		);
		expect(names).toEqual(new Set(['DATABASE_URL', 'SESSION_SIGNING_SECRET']));
	});

	it('ignores blank lines and trims trailing whitespace/newlines', () => {
		const names = parseGithubSecretNames('\nDATABASE_URL\t2024-01-01T00:00:00Z\n\n');
		expect(names).toEqual(new Set(['DATABASE_URL']));
	});

	it('returns an empty set for empty output', () => {
		expect(parseGithubSecretNames('')).toEqual(new Set());
	});
});
