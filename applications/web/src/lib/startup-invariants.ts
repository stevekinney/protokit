import { environment as databaseEnvironment } from '@template/database/env';
import { environment } from '@web/env';
import { collectProductionStartupFailures } from '@web/lib/production-startup-requirements';
import { isRedisConfigured } from '@web/lib/redis-client';

/** Strips the `readonly` `@t3-oss/env-core` puts on every field so tests can build a plain, mutable fixture object instead of satisfying — or globally mocking — the full environment schema. */
type Writable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * The slice of `@web/env`'s `environment` this module actually reads.
 * Deliberately narrow (a `Pick`, not `typeof environment`) so tests can
 * inject a plain object covering only these fields.
 */
type StartupWebEnvironment = Writable<
	Pick<
		typeof environment,
		| 'NODE_ENV'
		| 'BASE_URL'
		| 'REDIS_URL'
		| 'GOOGLE_CLIENT_ID'
		| 'GOOGLE_CLIENT_SECRET'
		| 'TRUSTED_PROXY_CIDRS'
		| 'TRUSTED_PROXY_HEADER'
		| 'NODE_TLS_REJECT_UNAUTHORIZED'
		| 'SESSION_SIGNING_SECRET'
		| 'MCP_CONFORMANCE_MODE'
	>
>;

/** The slice of `@template/database/env`'s `environment` this module reads. */
type StartupDatabaseEnvironment = Writable<
	Pick<
		typeof databaseEnvironment,
		'DATABASE_URL' | 'DATABASE_URL_UNPOOLED' | 'DATABASE_LOCAL_PROXY_URL'
	>
>;

export interface ProductionStartupInvariantSource {
	environment: StartupWebEnvironment;
	databaseEnvironment: StartupDatabaseEnvironment;
	isRedisConfigured: () => boolean;
}

const liveProductionStartupInvariantSource: ProductionStartupInvariantSource = {
	environment,
	databaseEnvironment,
	isRedisConfigured,
};

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
 * `source` defaults to the real, module-level singletons — `server.ts`
 * calls this with no arguments. Tests supply a fake `source` instead of
 * `mock.module`-ing `@web/env`/`@template/database/env`/`@web/lib/redis-client`,
 * which would otherwise leak into every test file that runs afterward in
 * the same process (OPEN-5).
 *
 * This function does not attempt a live network probe of Redis or
 * Postgres — that is what `/health` and the request-time paths already do.
 * It validates the *shape* of the configuration a production process was
 * handed, which is checkable instantly and without a live dependency.
 */
export function assertProductionStartupInvariants(
	source: ProductionStartupInvariantSource = liveProductionStartupInvariantSource,
): void {
	if (source.environment.NODE_ENV !== 'production') return;

	const failures = collectProductionStartupFailures({
		nodeEnvironment: source.environment.NODE_ENV,
		baseUrl: source.environment.BASE_URL,
		redisUrl: source.environment.REDIS_URL,
		isRedisConfigured: source.isRedisConfigured(),
		databaseUrl: source.databaseEnvironment.DATABASE_URL,
		databaseUrlUnpooled: source.databaseEnvironment.DATABASE_URL_UNPOOLED,
		databaseLocalProxyUrl: source.databaseEnvironment.DATABASE_LOCAL_PROXY_URL,
		googleClientId: source.environment.GOOGLE_CLIENT_ID,
		googleClientSecret: source.environment.GOOGLE_CLIENT_SECRET,
		trustedProxyCidrs: source.environment.TRUSTED_PROXY_CIDRS,
		trustedProxyHeader: source.environment.TRUSTED_PROXY_HEADER,
		nodeTlsRejectUnauthorized: source.environment.NODE_TLS_REJECT_UNAUTHORIZED,
		sessionSigningSecret: source.environment.SESSION_SIGNING_SECRET,
		mcpConformanceModeConfigured: source.environment.MCP_CONFORMANCE_MODE,
	});

	if (failures.length > 0) {
		throw new Error(`Refusing to start in production:\n- ${failures.join('\n- ')}`);
	}
}
