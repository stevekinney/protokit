import { neonConfig } from '@neondatabase/serverless';

/**
 * Points the Neon serverless driver's SQL-over-HTTP requests at a local
 * Neon-compatible proxy (see `docker/local-neon-http-proxy`) sitting in front
 * of a plain Postgres container, instead of a real Neon project.
 *
 * This is exclusively for local development and the test suite. It must
 * never run against production: pass `environment.databaseLocalProxyUrl`,
 * which is only set in `.env.local` and the test environment, never in a
 * deployed environment. When `localProxyUrl` is `undefined` this function
 * does nothing at all, so `neonConfig.fetchEndpoint` keeps the Neon driver's
 * own default resolution and production traffic against real Neon is
 * provably unaffected — see `local-proxy.test.ts`.
 */
export function applyLocalProxyFetchEndpoint(localProxyUrl: string | undefined): void {
	if (!localProxyUrl) {
		return;
	}

	neonConfig.fetchEndpoint = localProxyUrl;
}
