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
		trustedProxyHopCount: '1',
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

describe('collectProductionStartupFailures — .localtest.me Redis host', () => {
	it('rejects a rediss:// REDIS_URL pointed at a .localtest.me host', () => {
		// .localtest.me resolves to 127.0.0.1 and is this repository's
		// reserved loopback test domain (recognized by the DATABASE_URL
		// check immediately above). Before the fix, redisUrlFailures only
		// checked exact loopback hostnames (localhost, 127.0.0.1, ::1,
		// 0.0.0.0) via `loopbackHostnames.has(...)`, so a value such as
		// rediss://cache.localtest.me:6379 satisfied every check and was
		// accepted as production-ready.
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			redisUrl: 'rediss://cache.localtest.me:6379',
		});
		expect(failures.some((failure) => failure.includes('local host (cache.localtest.me)'))).toBe(
			true,
		);
	});

	it('still accepts a real, non-loopback Redis host that merely contains "localtest" as a substring', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			redisUrl: 'rediss://not-localtest.me.example.com:6379',
		});
		expect(failures.some((failure) => failure.includes('local host'))).toBe(false);
	});
});

describe('collectProductionStartupFailures — unparseable URLs', () => {
	it('rejects a DATABASE_URL that could not be parsed as a URL at all', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrl: 'not a url',
		});
		expect(
			failures.some(
				(failure) => failure.includes('DATABASE_URL') && failure.includes('could not be parsed'),
			),
		).toBe(true);
	});

	it('rejects a DATABASE_URL_UNPOOLED that could not be parsed as a URL at all', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			databaseUrlUnpooled: 'not a url',
		});
		expect(
			failures.some(
				(failure) =>
					failure.includes('DATABASE_URL_UNPOOLED') && failure.includes('could not be parsed'),
			),
		).toBe(true);
	});

	it('rejects a REDIS_URL that could not be parsed as a URL at all', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			redisUrl: 'not a url',
		});
		expect(
			failures.some(
				(failure) => failure.includes('REDIS_URL') && failure.includes('could not be parsed'),
			),
		).toBe(true);
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

	it('rejects a TRUSTED_PROXY_CIDRS value that normalizes to zero entries', () => {
		// A bare separator (or whitespace-only entries) is a nonempty raw string, so it
		// passes the both-set check above, but `.split(',').filter(Boolean)` normalizes it
		// to an empty array. Without an explicit empty-list check, `malformedCidrs` stays
		// empty too (there is nothing left to call malformed) and production would start
		// trusting no proxy at all -- identifying every request by the proxy's own socket
		// address, collapsing rate limiting and failed-auth lockouts onto one shared bucket.
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			trustedProxyCidrs: ',',
		});
		expect(
			failures.some(
				(failure) =>
					failure.includes('TRUSTED_PROXY_CIDRS') && failure.includes('no usable entries'),
			),
		).toBe(true);
	});

	it('rejects a whitespace-only TRUSTED_PROXY_CIDRS value', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			trustedProxyCidrs: '   ,   ',
		});
		expect(
			failures.some(
				(failure) =>
					failure.includes('TRUSTED_PROXY_CIDRS') && failure.includes('no usable entries'),
			),
		).toBe(true);
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

/**
 * Regression test for the round-16 review-thread claim on
 * `applications/web/src/lib/mcp-origin-validation.ts:57`: a malformed
 * `MCP_ALLOWED_ORIGINS` entry used to be silently dropped by
 * `parseAllowedOrigins`, so production could start successfully with a
 * configured allow-list that matches nothing. This is the fail-closed
 * startup-time enforcement `doctor.test.ts` also exercises through
 * `evaluateProductionReadiness`.
 */
describe('collectProductionStartupFailures — MCP_ALLOWED_ORIGINS', () => {
	it('accepts every entry canonicalizing cleanly', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			mcpAllowedOrigins: 'https://claude.ai,http://localhost:3000',
		});
		expect(failures.some((failure) => failure.includes('MCP_ALLOWED_ORIGINS'))).toBe(false);
	});

	it('rejects a nonempty value made entirely of malformed entries', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			mcpAllowedOrigins: 'https://claude.ai/callback',
		});
		const failure = failures.find((entry) => entry.includes('MCP_ALLOWED_ORIGINS'));
		expect(failure).toBeDefined();
		expect(failure).toContain('https://claude.ai/callback');
	});

	it('rejects a value that mixes a valid entry with a malformed one', () => {
		const failures = collectProductionStartupFailures({
			...validConfiguration(),
			mcpAllowedOrigins: 'https://claude.ai,https://claude.ai/callback',
		});
		expect(failures.some((failure) => failure.includes('MCP_ALLOWED_ORIGINS'))).toBe(true);
	});

	it('is not checked when mcpAllowedOrigins is not supplied (existing call sites/fixtures need no update)', () => {
		const failures = collectProductionStartupFailures(validConfiguration());
		expect(failures.some((failure) => failure.includes('MCP_ALLOWED_ORIGINS'))).toBe(false);
	});
});

/**
 * Round 17 review finding (P2): `TRUSTED_PROXY_HOP_COUNT` reached Railway
 * from `.env.local` without any validator seeing it, so `scripts/setup.ts`
 * reported success and configured a deployment that then refused to boot
 * when `environment-schema.ts` rejected the value. It lives on the shared
 * configuration now, so real startup, `doctor`, and the Railway readiness
 * gate all reach the identical check — the first version of this fix was a
 * setup-local mirror, which is exactly the drift this collector prevents.
 */
describe('collectProductionStartupFailures — TRUSTED_PROXY_HOP_COUNT', () => {
	function failuresFor(trustedProxyHopCount: string | undefined): string[] {
		return collectProductionStartupFailures({ ...validConfiguration(), trustedProxyHopCount });
	}

	function namesHopCount(failures: string[]): boolean {
		return failures.some((failure) => failure.includes('TRUSTED_PROXY_HOP_COUNT'));
	}

	it('accepts a positive integer', () => {
		expect(namesHopCount(failuresFor('1'))).toBe(false);
		expect(namesHopCount(failuresFor('2'))).toBe(false);
		expect(namesHopCount(failuresFor(' 3 '))).toBe(false);
	});

	it('accepts the value being unset, which the schema defaults', () => {
		expect(namesHopCount(failuresFor(undefined))).toBe(false);
	});

	it('rejects zero, which the schema requires to be positive', () => {
		expect(namesHopCount(failuresFor('0'))).toBe(true);
	});

	it('rejects a negative, fractional, empty, or nonnumeric value', () => {
		for (const value of ['-1', '1.5', '', '   ', 'not-a-number', '1e3']) {
			expect(namesHopCount(failuresFor(value))).toBe(true);
		}
	});
});
