import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import {
	evaluateEnvironmentSchema,
	evaluateEnvironmentSchemas,
	evaluateProductionReadiness,
	loadCandidateVariables,
	parseArguments,
	resolveTarget,
	summarize,
	type CandidateVariables,
} from './doctor.ts';

/** A fully valid configuration for every package's schema and every production invariant. */
function validVariables(): CandidateVariables {
	return {
		NODE_ENV: 'production',
		DATABASE_URL:
			'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=require',
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
		// NODE_ENV is required in both @template/mcp's and @template/web's schema.
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
			results.some((entry) => entry.detail.includes('must both be set or both be absent')),
		).toBe(true);
	});

	it('never includes a raw credential value in a failure message', () => {
		const variables = validVariables();
		variables.REDIS_URL = 'rediss://admin:admin@production-redis.example.com:6380';
		variables.DATABASE_URL =
			'postgresql://root:root@production-host.example.com:5432/app?sslmode=require';
		const results = evaluateProductionReadiness('production', variables);
		const joined = results.map((entry) => entry.detail).join('\n');
		expect(joined).not.toContain('admin:admin');
		expect(joined).not.toContain('root:root');
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
