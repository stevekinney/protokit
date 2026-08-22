import { describe, expect, it } from 'bun:test';

import {
	collectProductionStartupFailures,
	type ProductionStartupConfiguration,
} from '@web/lib/production-startup-requirements';

/**
 * Direct unit tests for `collectProductionStartupFailures`, focused on
 * OPEN-2: the certificate-validation claim must actually be true, for both
 * Postgres and Redis, and for the one process-wide lever
 * (`NODE_TLS_REJECT_UNAUTHORIZED=0`) that can silently defeat it.
 *
 * `startup-invariants.test.ts` covers the same function indirectly through
 * `assertProductionStartupInvariants`; this file tests the pure function in
 * isolation so a regression here fails with a message that names the exact
 * connection-string value under test, not just "production startup throws."
 */
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
		nodeTlsRejectUnauthorized: undefined,
		sessionSigningSecret: 'a'.repeat(32),
		mcpConformanceModeConfigured: false,
	};
}

describe('collectProductionStartupFailures — certificate validation (OPEN-2)', () => {
	it('accepts sslmode=verify-full', () => {
		expect(collectProductionStartupFailures(validConfiguration())).toEqual([]);
	});

	it('rejects a bare DATABASE_URL with no sslmode at all', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrl: 'postgresql://produser:realsecret@production-host.example.com:5432/app',
		});
		expect(failures.some((failure) => failure.includes('sslmode=verify-full'))).toBe(true);
	});

	it('rejects sslmode=require — it encrypts but does not verify the server certificate', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrl:
				'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=require',
		});
		const failure = failures.find((entry) => entry.includes('DATABASE_URL'));
		expect(failure).toBeDefined();
		expect(failure).toContain('sslmode=verify-full');
	});

	it('rejects sslmode=verify-ca — it verifies the certificate chain but not the hostname', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrl:
				'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=verify-ca',
		});
		expect(failures.some((failure) => failure.includes('sslmode=verify-full'))).toBe(true);
	});

	it('applies the same sslmode=verify-full rule to DATABASE_URL_UNPOOLED when set', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrlUnpooled:
				'postgresql://produser:realsecret@production-host-2.example.com:5432/app?sslmode=require',
		});
		const failure = failures.find((entry) => entry.includes('DATABASE_URL_UNPOOLED'));
		expect(failure).toBeDefined();
		expect(failure).toContain('sslmode=verify-full');
	});

	it('still requires the rediss:// scheme for Redis', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			redisUrl: 'redis://production-redis.example.com:6379',
		});
		expect(failures.some((failure) => failure.includes('rediss://'))).toBe(true);
	});

	it('rejects NODE_TLS_REJECT_UNAUTHORIZED=0, which disables certificate validation process-wide', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			nodeTlsRejectUnauthorized: '0',
		});
		expect(failures.some((failure) => failure.includes('NODE_TLS_REJECT_UNAUTHORIZED=0'))).toBe(
			true,
		);
	});

	it('reports NODE_TLS_REJECT_UNAUTHORIZED=0 even when every other setting is otherwise valid', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			nodeTlsRejectUnauthorized: '0',
		});
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('NODE_TLS_REJECT_UNAUTHORIZED=0');
	});

	it('does not flag NODE_TLS_REJECT_UNAUTHORIZED when unset', () => {
		const failures = collectProductionStartupFailures(validConfiguration());
		expect(failures.some((failure) => failure.includes('NODE_TLS_REJECT_UNAUTHORIZED'))).toBe(
			false,
		);
	});

	it('does not flag a non-"0" NODE_TLS_REJECT_UNAUTHORIZED value (Node only disables validation on the literal "0")', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			nodeTlsRejectUnauthorized: '1',
		});
		expect(failures.some((failure) => failure.includes('NODE_TLS_REJECT_UNAUTHORIZED'))).toBe(
			false,
		);
	});
});

describe('collectProductionStartupFailures — bracketed IPv6 loopback hosts', () => {
	it('rejects a bracketed IPv6 loopback Redis host (rediss://[::1]:6380)', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			redisUrl: 'rediss://[::1]:6380',
		});
		expect(failures.some((failure) => failure.includes('local host (::1)'))).toBe(true);
	});

	it('rejects a bracketed IPv6 loopback DATABASE_URL host', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrl: 'postgresql://produser:realsecret@[::1]:5432/app?sslmode=verify-full',
		});
		expect(failures.some((failure) => failure.includes('local host (::1)'))).toBe(true);
	});

	it('still accepts a real, non-loopback bracketed IPv6 Redis host', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			redisUrl: 'rediss://[2001:db8::1]:6380',
		});
		expect(failures.some((failure) => failure.includes('local host'))).toBe(false);
	});
});

describe('collectProductionStartupFailures — non-Postgres DATABASE_URL scheme', () => {
	it('rejects a well-formed, non-loopback, non-Postgres DATABASE_URL', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrl: 'https://db.example.com/database?sslmode=verify-full',
		});
		expect(
			failures.some(
				(failure) => failure.includes('DATABASE_URL') && failure.includes('postgres://'),
			),
		).toBe(true);
	});

	it('accepts the postgres:// scheme, not only postgresql://', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrl:
				'postgres://produser:realsecret@production-host.example.com:5432/app?sslmode=verify-full',
		});
		expect(failures.some((failure) => failure.includes('scheme'))).toBe(false);
	});

	it('applies the same scheme rule to DATABASE_URL_UNPOOLED when set', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrlUnpooled: 'https://db.example.com/database?sslmode=verify-full',
		});
		expect(
			failures.some(
				(failure) => failure.includes('DATABASE_URL_UNPOOLED') && failure.includes('postgres://'),
			),
		).toBe(true);
	});
});

describe('collectProductionStartupFailures — production authentication provider', () => {
	// Review round 4 / P1: production disables `/auth/dev/login`
	// (development-only) and an unauthenticated `/oauth/authorize` request
	// unconditionally redirects to `/auth/google/start`, which 503s with no
	// Google credentials configured — a deployment could otherwise pass
	// every other startup check while nobody could sign in.
	it('rejects a production configuration with both Google credentials absent', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			googleClientId: undefined,
			googleClientSecret: undefined,
		});
		expect(
			failures.some((failure) =>
				failure.includes('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set'),
			),
		).toBe(true);
	});

	it('rejects a production configuration with only one Google credential set', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			googleClientSecret: undefined,
		});
		expect(
			failures.some((failure) =>
				failure.includes('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set'),
			),
		).toBe(true);
	});

	it('accepts a production configuration with both Google credentials set', () => {
		expect(collectProductionStartupFailures(validConfiguration())).toEqual([]);
	});
});

describe('collectProductionStartupFailures — malformed TRUSTED_PROXY_CIDRS', () => {
	it('rejects a syntactically invalid CIDR entry', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			trustedProxyCidrs: 'not-a-cidr',
		});
		expect(
			failures.some(
				(failure) => failure.includes('TRUSTED_PROXY_CIDRS') && failure.includes('not-a-cidr'),
			),
		).toBe(true);
	});

	it('rejects a CIDR with a prefix length that exceeds the address family width', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			trustedProxyCidrs: '10.0.0.0/40',
		});
		expect(failures.some((failure) => failure.includes('TRUSTED_PROXY_CIDRS'))).toBe(true);
	});

	it('accepts multiple valid, comma-separated CIDR entries of mixed families', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			trustedProxyCidrs: '10.0.0.0/8, 2001:db8::/32',
		});
		expect(failures.some((failure) => failure.includes('TRUSTED_PROXY_CIDRS'))).toBe(false);
	});

	it('names every malformed entry when more than one is present', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			trustedProxyCidrs: '10.0.0.0/8, not-a-cidr, also-bad',
		});
		const failure = failures.find((entry) => entry.includes('TRUSTED_PROXY_CIDRS'));
		expect(failure).toBeDefined();
		expect(failure).toContain('not-a-cidr');
		expect(failure).toContain('also-bad');
	});
});

describe('collectProductionStartupFailures — non-origin BASE_URL', () => {
	it('rejects a BASE_URL with a path', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			baseUrl: 'https://example.com/app',
		});
		expect(failures.some((failure) => failure.includes('canonical origin'))).toBe(true);
	});

	it('rejects a BASE_URL with a query string', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			baseUrl: 'https://example.com?foo=bar',
		});
		expect(failures.some((failure) => failure.includes('canonical origin'))).toBe(true);
	});

	it('rejects a BASE_URL with a fragment', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			baseUrl: 'https://example.com#section',
		});
		expect(failures.some((failure) => failure.includes('canonical origin'))).toBe(true);
	});

	it('rejects a BASE_URL with embedded userinfo', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			baseUrl: 'https://user:pass@example.com',
		});
		expect(failures.some((failure) => failure.includes('canonical origin'))).toBe(true);
	});

	it('rejects a BASE_URL that could not be parsed as a URL', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			baseUrl: 'https://',
		});
		expect(failures.some((failure) => failure.includes('BASE_URL'))).toBe(true);
	});

	it('accepts a canonical origin with an explicit port', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			baseUrl: 'https://example.com:8443',
		});
		expect(failures.some((failure) => failure.includes('canonical origin'))).toBe(false);
	});
});

describe('collectProductionStartupFailures — SESSION_SIGNING_SECRET', () => {
	it('rejects an otherwise fully valid production configuration when SESSION_SIGNING_SECRET is absent (matches resolveSessionSigningSecrets(), which refuses to start without it)', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			sessionSigningSecret: undefined,
		});
		expect(failures.some((failure) => failure.includes('SESSION_SIGNING_SECRET'))).toBe(true);
	});

	it('accepts a configured SESSION_SIGNING_SECRET', () => {
		const failures = collectProductionStartupFailures(validConfiguration());
		expect(failures.some((failure) => failure.includes('SESSION_SIGNING_SECRET'))).toBe(false);
	});
});
