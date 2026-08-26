import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { database, schema } from './index';
import { applyLocalProxyFetchEndpoint } from './local-proxy';
import { createDatabaseClient } from './create-database-client';

/**
 * `neonConfig` is a module-level singleton shared by every test file in the
 * process, so applying the local-proxy override here would otherwise leak
 * into whatever file `bun test` runs next -- the exact cross-file ordering
 * hazard `local-proxy.test.ts` documents having already caused a
 * continuous-integration failure that passed locally. The override is
 * applied inside `beforeAll` (not at describe-body scope, which runs during
 * collection, before any other file's `beforeAll` has a chance to capture a
 * clean value) and restored in `afterAll`.
 */
describe('createDatabaseClient', () => {
	const originalFetchEndpoint = neonConfig.fetchEndpoint;

	beforeAll(() => {
		applyLocalProxyFetchEndpoint(process.env.DATABASE_LOCAL_PROXY_URL);
	});

	afterAll(() => {
		neonConfig.fetchEndpoint = originalFetchEndpoint;
	});

	describe('neon-http overload', () => {
		it('builds a working, queryable client', async () => {
			const client = createDatabaseClient(neon(process.env.DATABASE_URL!));
			const rows = await client.select().from(schema.users).limit(0);
			expect(rows).toEqual([]);
		});

		it('is a genuine factory: two calls yield two distinct instances, neither the shared singleton', () => {
			const first = createDatabaseClient(neon(process.env.DATABASE_URL!));
			const second = createDatabaseClient(neon(process.env.DATABASE_URL!));

			expect(first).not.toBe(second);
			expect(first).not.toBe(database);
			expect(second).not.toBe(database);
		});
	});

	describe('Pool overload', () => {
		const pool = new Pool({ connectionString: process.env.DATABASE_URL });

		afterAll(async () => {
			await pool.end();
		});

		it('dispatches to drizzle-orm/neon-serverless', () => {
			// No query is run against this instance: the local test proxy
			// (docker/local-neon-http-proxy) is HTTP-only, so the Pool/websocket
			// path has no reachable real database in this environment. Asserting
			// the constructed instance's type is what exercises the `else`
			// dispatch branch below for the coverage gate; a real round-trip
			// query over this branch is out of scope here.
			const result = createDatabaseClient(pool);
			expect(result).toBeInstanceOf(NeonDatabase);
		});
	});
});
