import { environment as databaseEnvironment } from '@template/database/env';
import { environment } from '@web/env';
import { collectProductionStartupFailures } from '@web/lib/production-startup-requirements';
import { isRedisConfigured } from '@web/lib/redis-client';

/**
 * Fail-closed production startup checks. Called once from `server.ts`
 * before `Bun.serve` accepts any traffic. Originally introduced narrowly by
 * SEC-003 for the shared atomic rate limiter; CONFIG-001 extends it with the
 * rest of production's fail-closed invariants (S-06 / S-20): no implicit
 * `development` mode, no insecure or absent database/Redis transport, no
 * canonical base URL omission, no missing trusted-proxy configuration, and
 * no partially-configured Google sign-in.
 *
 * The actual checks live in the pure, parameter-only
 * `production-startup-requirements.ts` — `scripts/doctor.ts` calls that same
 * function with a candidate configuration so it can report the identical
 * verdict as a readable diagnostic instead of an uncaught exception. This
 * function's only job is gathering the live, already-validated environment
 * into that shape and deciding whether to throw.
 *
 * This function does not attempt a live network probe of Redis or
 * Postgres — that is what `/health` and the request-time paths already do.
 * It validates the *shape* of the configuration a production process was
 * handed, which is checkable instantly and without a live dependency.
 */
export function assertProductionStartupInvariants(): void {
	if (environment.NODE_ENV !== 'production') return;

	const failures = collectProductionStartupFailures({
		nodeEnvironment: environment.NODE_ENV,
		baseUrl: environment.BASE_URL,
		redisUrl: environment.REDIS_URL,
		isRedisConfigured: isRedisConfigured(),
		databaseUrl: databaseEnvironment.DATABASE_URL,
		databaseUrlUnpooled: databaseEnvironment.DATABASE_URL_UNPOOLED,
		databaseLocalProxyUrl: databaseEnvironment.DATABASE_LOCAL_PROXY_URL,
		googleClientId: environment.GOOGLE_CLIENT_ID,
		googleClientSecret: environment.GOOGLE_CLIENT_SECRET,
		trustedProxyCidrs: environment.TRUSTED_PROXY_CIDRS,
		trustedProxyHeader: environment.TRUSTED_PROXY_HEADER,
	});

	if (failures.length > 0) {
		throw new Error(`Refusing to start in production:\n- ${failures.join('\n- ')}`);
	}
}
