import { describe, expect, it } from 'bun:test';

import {
	assertProductionStartupInvariants,
	type ProductionStartupInvariantSource,
} from '@web/lib/startup-invariants';
import {
	collectProductionStartupFailures,
	type ProductionStartupConfiguration,
} from '@web/lib/production-startup-requirements';

// OPEN-5: these tests used to drive `assertProductionStartupInvariants()`
// through `mock.module('@web/env', ...)` / `mock.module('@template/database/env',
// ...)` / `mock.module('@web/lib/redis-client', ...)`. Bun's `mock.module` is
// global and is never restored at file boundaries, so those mocks leaked into
// whatever ran after this file in the same test process. `assertProductionStartupInvariants`
// now takes an injectable `source` (see `startup-invariants.ts`) instead, so
// these tests build a plain object and pass it directly — no global mocking,
// nothing to leak.
const mockEnvironment: ProductionStartupInvariantSource['environment'] = {
	NODE_ENV: 'development',
	BASE_URL: undefined,
	REDIS_URL: undefined,
	GOOGLE_CLIENT_ID: undefined,
	GOOGLE_CLIENT_SECRET: undefined,
	TRUSTED_PROXY_CIDRS: undefined,
	TRUSTED_PROXY_HEADER: undefined,
	NODE_TLS_REJECT_UNAUTHORIZED: undefined,
	SESSION_SIGNING_SECRET: undefined,
	MCP_CONFORMANCE_MODE: false,
};
const mockDatabaseEnvironment: ProductionStartupInvariantSource['databaseEnvironment'] = {
	DATABASE_URL:
		'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=verify-full',
	DATABASE_URL_UNPOOLED: undefined,
	DATABASE_LOCAL_PROXY_URL: undefined,
};
let redisConfigured = false;

function invoke(): void {
	assertProductionStartupInvariants({
		environment: mockEnvironment,
		databaseEnvironment: mockDatabaseEnvironment,
		isRedisConfigured: () => redisConfigured,
	});
}

/** A fully valid production configuration. Tests mutate one field away from this. */
function resetToValidProductionConfiguration(): void {
	mockEnvironment.NODE_ENV = 'production';
	mockEnvironment.BASE_URL = 'https://app.example.com';
	mockEnvironment.REDIS_URL = 'rediss://production-redis.example.com:6380';
	mockEnvironment.GOOGLE_CLIENT_ID = 'client-id';
	mockEnvironment.GOOGLE_CLIENT_SECRET = 'client-secret';
	mockEnvironment.TRUSTED_PROXY_CIDRS = '10.0.0.0/8';
	mockEnvironment.TRUSTED_PROXY_HEADER = 'x-forwarded-for';
	mockEnvironment.NODE_TLS_REJECT_UNAUTHORIZED = undefined;
	mockEnvironment.SESSION_SIGNING_SECRET = 'a'.repeat(32);
	mockEnvironment.MCP_CONFORMANCE_MODE = false;
	redisConfigured = true;
	mockDatabaseEnvironment.DATABASE_URL =
		'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=verify-full';
	mockDatabaseEnvironment.DATABASE_URL_UNPOOLED = undefined;
	mockDatabaseEnvironment.DATABASE_LOCAL_PROXY_URL = undefined;
}

describe('assertProductionStartupInvariants', () => {
	it('does nothing outside production, even with a fully invalid configuration', () => {
		mockEnvironment.NODE_ENV = 'development';
		mockEnvironment.BASE_URL = undefined;
		redisConfigured = false;
		expect(() => invoke()).not.toThrow();
	});

	it('does nothing in test, even with a fully invalid configuration', () => {
		mockEnvironment.NODE_ENV = 'test';
		mockEnvironment.BASE_URL = undefined;
		redisConfigured = false;
		expect(() => invoke()).not.toThrow();
	});

	it('does not throw in production when every setting is valid', () => {
		resetToValidProductionConfiguration();
		expect(() => invoke()).not.toThrow();
	});

	it('throws in production when Redis is not configured', () => {
		resetToValidProductionConfiguration();
		redisConfigured = false;
		expect(() => invoke()).toThrow(/REDIS_URL is not set/);
	});

	it('throws in production when REDIS_URL is not the encrypted rediss:// scheme', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.REDIS_URL = 'redis://production-redis.example.com:6379';
		expect(() => invoke()).toThrow(/rediss:\/\//);
	});

	it('throws in production when REDIS_URL points at a loopback host', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.REDIS_URL = 'rediss://localhost:6380';
		expect(() => invoke()).toThrow(/local host/);
	});

	it('throws in production when REDIS_URL uses placeholder credentials', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.REDIS_URL = 'rediss://test:test@production-redis.example.com:6380';
		expect(() => invoke()).toThrow(/placeholder credentials/);
	});

	it('throws in production when BASE_URL is not set', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.BASE_URL = undefined;
		expect(() => invoke()).toThrow(/BASE_URL is not set/);
	});

	it('throws in production when BASE_URL is not https', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.BASE_URL = 'http://app.example.com';
		expect(() => invoke()).toThrow(/must use https/);
	});

	it('throws in production when DATABASE_URL has no encrypted, verified transport', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_URL =
			'postgresql://produser:realsecret@production-host.example.com:5432/app';
		expect(() => invoke()).toThrow(/sslmode=verify-full/);
	});

	it('throws in production when DATABASE_URL only encrypts (sslmode=require) without verifying the certificate', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_URL =
			'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=require';
		expect(() => invoke()).toThrow(/sslmode=verify-full/);
	});

	it('throws in production when DATABASE_URL verifies the CA but not the hostname (sslmode=verify-ca)', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_URL =
			'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=verify-ca';
		expect(() => invoke()).toThrow(/sslmode=verify-full/);
	});

	it('throws in production when NODE_TLS_REJECT_UNAUTHORIZED=0 disables certificate validation process-wide', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		expect(() => invoke()).toThrow(/NODE_TLS_REJECT_UNAUTHORIZED=0/);
	});

	it('throws in production when SESSION_SIGNING_SECRET is not set, matching resolveSessionSigningSecrets()', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.SESSION_SIGNING_SECRET = undefined;
		expect(() => invoke()).toThrow(/SESSION_SIGNING_SECRET is not set/);
	});

	it('throws in production when DATABASE_URL points at a local host', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_URL =
			'postgresql://produser:realsecret@localhost:5432/app?sslmode=verify-full';
		expect(() => invoke()).toThrow(/local host/);
	});

	it('throws in production when DATABASE_URL uses placeholder credentials', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_URL =
			'postgresql://user:password@production-host.example.com:5432/app?sslmode=verify-full';
		expect(() => invoke()).toThrow(/placeholder credentials/);
	});

	it('throws in production when DATABASE_LOCAL_PROXY_URL is set', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_LOCAL_PROXY_URL = 'http://db.localtest.me:4444/sql';
		expect(() => invoke()).toThrow(/DATABASE_LOCAL_PROXY_URL is set/);
	});

	it('throws in production when TRUSTED_PROXY_CIDRS is not set', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.TRUSTED_PROXY_CIDRS = undefined;
		expect(() => invoke()).toThrow(/TRUSTED_PROXY_CIDRS and TRUSTED_PROXY_HEADER are not both set/);
	});

	it('throws in production when TRUSTED_PROXY_HEADER is not set', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.TRUSTED_PROXY_HEADER = undefined;
		expect(() => invoke()).toThrow(/TRUSTED_PROXY_CIDRS and TRUSTED_PROXY_HEADER are not both set/);
	});

	it('throws in production when Google credentials are partially configured', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.GOOGLE_CLIENT_SECRET = undefined;
		expect(() => invoke()).toThrow(/GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set/);
	});

	// Review round 4 / P1: previously did not throw. Production disables
	// `/auth/dev/login` (development-only) and an unauthenticated
	// `/oauth/authorize` request unconditionally redirects to
	// `/auth/google/start`, which 503s with no Google credentials configured
	// — a deployment could pass every other startup check while no user
	// could ever sign in. There is no other production authentication
	// provider in this codebase, so both credentials are now required
	// outright, not merely required to agree with each other.
	it('throws in production when Google credentials are both absent', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.GOOGLE_CLIENT_ID = undefined;
		mockEnvironment.GOOGLE_CLIENT_SECRET = undefined;
		expect(() => invoke()).toThrow(/GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set/);
	});

	it('throws in production when MCP_CONFORMANCE_MODE is true (review round 4: this bypasses shouldEnableConformanceMode entirely, since that predicate only checks PROTOKIT_TUNNEL_ACTIVE, never NODE_ENV)', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.MCP_CONFORMANCE_MODE = true;
		expect(() => invoke()).toThrow(/MCP_CONFORMANCE_MODE is true/);
	});

	it('reports every failing setting in one error, not just the first', () => {
		resetToValidProductionConfiguration();
		redisConfigured = false;
		mockEnvironment.BASE_URL = undefined;
		try {
			invoke();
			throw new Error('expected assertProductionStartupInvariants to throw');
		} catch (error) {
			const message = (error as Error).message;
			expect(message).toContain('REDIS_URL is not set');
			expect(message).toContain('BASE_URL is not set');
		}
	});

	it('uses the live environment singletons when called with no source', () => {
		// The default parameter wires the real `@web/env` / `@template/database/env`
		// / `@web/lib/redis-client` modules — this test runs under `NODE_ENV=test`
		// (see the package `test` script), so this only proves the zero-argument
		// call path exercises real modules and returns without throwing, matching
		// server.ts's own zero-argument call.
		expect(() => assertProductionStartupInvariants()).not.toThrow();
	});
});

/** A fully valid production configuration, used directly against the pure function. */
function validConfiguration(): ProductionStartupConfiguration {
	return {
		nodeEnvironment: 'production',
		baseUrl: 'https://app.example.com',
		redisUrl: 'rediss://production-redis.example.com:6380',
		isRedisConfigured: true,
		databaseUrl:
			'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=verify-full',
		databaseUrlUnpooled: undefined,
		databaseLocalProxyUrl: undefined,
		googleClientId: 'client-id',
		googleClientSecret: 'client-secret',
		trustedProxyCidrs: '10.0.0.0/8',
		trustedProxyHeader: 'x-forwarded-for',
		sessionSigningSecret: 'a'.repeat(32),
		mcpConformanceModeConfigured: false,
	};
}

describe('collectProductionStartupFailures', () => {
	it('returns no failures for a fully valid production configuration', () => {
		expect(collectProductionStartupFailures(validConfiguration())).toEqual([]);
	});

	it(
		'reports NODE_ENV mismatch — this is doctor-reachable but never triggered by the real ' +
			'server, since assertProductionStartupInvariants only calls this once NODE_ENV is already production',
		() => {
			const failures = collectProductionStartupFailures({
				...validConfiguration(),
				nodeEnvironment: 'development',
			});
			expect(failures.some((failure) => failure.includes('NODE_ENV is "development"'))).toBe(true);
		},
	);

	it('reports MCP_CONFORMANCE_MODE=true as a production startup failure', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			mcpConformanceModeConfigured: true,
		});
		expect(failures.some((failure) => failure.includes('MCP_CONFORMANCE_MODE is true'))).toBe(true);
	});

	it('never includes a raw credential value in a failure message', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			redisUrl: 'rediss://admin:admin@production-redis.example.com:6380',
			databaseUrl:
				'postgresql://root:root@production-host.example.com:5432/app?sslmode=verify-full',
		});
		const joined = failures.join('\n');
		expect(joined).not.toContain('admin:admin');
		expect(joined).not.toContain('root:root');
	});
});
