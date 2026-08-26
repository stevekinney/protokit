import type { NeonQueryFunction, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePool, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema.js';

/**
 * Driver-agnostic counterpart to the `database` Proxy singleton exported
 * from `./index.js`. That singleton is convenient for this application, but
 * unusable by a sibling app: importing anything from `./index.js` -- even
 * just `schema` off the same module -- eagerly runs `./env.js`'s
 * environment resolution against the *importing* process's environment
 * variables, which is exactly the coupling a sibling app must not inherit.
 *
 * This factory takes an already-constructed Neon client instead of a
 * connection string, because a bare string is ambiguous between the two
 * drivers below, and because leaving `neon(...)`/`new Pool(...)`
 * construction (SSL, pooling, auth tokens) to the caller is exactly the
 * flexibility a sibling app needs. It intentionally does not read
 * `environment.databaseLocalProxyUrl` or call
 * `applyLocalProxyFetchEndpoint` itself -- a caller that needs the local
 * proxy override calls that export directly before constructing its own
 * client, the same way `index.test.ts` and `migrate.ts` already do.
 *
 * The two drizzle-orm submodules used here (`neon-http` and
 * `neon-serverless`) each define their own driver-specific result-kind HKT
 * (`NeonHttpQueryResultHKT` vs `NeonQueryResultHKT`), so there is no single
 * generic return type that covers both drivers without either a union or
 * overloads. Overloads are used here so a caller passing a `neon(...)`
 * client gets back a precise `NeonHttpDatabase`, and a caller passing a
 * `Pool` gets back a precise `NeonDatabase`, rather than a union either
 * caller would have to narrow themselves.
 *
 * Dispatch is on `typeof connection === 'function'`: `neon(...)` returns a
 * callable tagged-template function, while a `Pool` instance does not, so
 * this is a safe and exhaustive runtime discriminant between the two
 * overloads' input types.
 *
 * The `Pool` overload only accepts `Pool`, not the wider `NeonClient` union
 * (`Pool | PoolClient | Client`) that `drizzle-orm/neon-serverless` accepts
 * internally -- `Pool` is what that submodule's own `drizzle()` documents as
 * its top-level entry point (`TClient extends NeonClient = Pool`), and
 * accepting a single checked-out `PoolClient`/`Client` here would invite a
 * caller to hand in a connection with no lifecycle story this factory owns.
 * Widening to `Client` is a future change to this same overload, not a new
 * factory.
 */
export function createDatabaseClient(
	connection: NeonQueryFunction<false, false>,
): NeonHttpDatabase<typeof schema>;
export function createDatabaseClient(connection: Pool): NeonDatabase<typeof schema>;
export function createDatabaseClient(
	connection: NeonQueryFunction<false, false> | Pool,
): NeonHttpDatabase<typeof schema> | NeonDatabase<typeof schema> {
	if (typeof connection === 'function') {
		return drizzleHttp(connection, { schema });
	}
	return drizzlePool(connection, { schema });
}
