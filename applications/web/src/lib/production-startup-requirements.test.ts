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
