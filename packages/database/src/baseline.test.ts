import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import { afterAll, describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { baselineExistingDatabase } from './baseline';
import { environment } from './env';
import { applyLocalProxyFetchEndpoint } from './local-proxy';

/**
 * Exercises `baselineExistingDatabase` against the real shared Postgres
 * instance (through the local Neon HTTP proxy), not a mock. Every scenario
 * uses a per-run unique migrations-tracking schema/table and a per-run
 * unique "check table" so this never touches the real
 * `drizzle.__drizzle_migrations` table the shared database's actual
 * migrations rely on, and never collides with another concurrent test run.
 */
describe('baselineExistingDatabase', () => {
	applyLocalProxyFetchEndpoint(environment.databaseLocalProxyUrl);
	const client = neon(environment.databaseUrl);
	const database = drizzle(client);

	const runId = randomUUID().replace(/-/g, '_');
	const migrationsSchema = `test_baseline_${runId}`;
	const migrationsTable = '__drizzle_migrations';
	const checkSchema = 'public';
	const checkTable = `test_baseline_check_${runId}`;

	afterAll(async () => {
		await database.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(migrationsSchema)} CASCADE`);
		await database.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(checkTable)}`);
	});

	it('refuses to baseline a database that has none of the checked tables ("fresh-database")', async () => {
		// No table named `checkTable` exists anywhere yet.
		const result = await baselineExistingDatabase(database, {
			migrationsSchema,
			migrationsTable,
			checkSchema,
			checkTable,
		});

		expect(result).toEqual({ outcome: 'fresh-database' });

		// And critically: it must not have written a tracking row, so a real
		// `migrate()` run afterward still creates the schema for real instead
		// of silently skipping it.
		const rows = await database.execute<{ count: string }>(
			sql`SELECT count(*)::text AS count FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
		);
		expect(rows.rows[0]?.count).toBe('0');
	});

	it('baselines a database whose tables already exist, recording the real migration file hash', async () => {
		await database.execute(
			sql`CREATE TABLE IF NOT EXISTS ${sql.identifier(checkTable)} (id uuid PRIMARY KEY)`,
		);

		const result = await baselineExistingDatabase(database, {
			migrationsSchema,
			migrationsTable,
			checkSchema,
			checkTable,
		});

		expect(result.outcome).toBe('baselined');
		if (result.outcome !== 'baselined') {
			throw new Error('expected outcome to be baselined');
		}
		// sha256 hex digest is 64 hex characters.
		expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
		expect(result.createdAt).toBeGreaterThan(0);

		const rows = await database.execute<{ hash: string; created_at: string }>(
			sql`SELECT hash, created_at::text AS created_at FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
		);
		expect(rows.rows).toHaveLength(1);
		expect(rows.rows[0]?.hash).toBe(result.hash);
		expect(Number(rows.rows[0]?.created_at)).toBe(result.createdAt);
	});

	it('is idempotent: baselining an already-tracked database is a no-op that never inserts a second row', async () => {
		// The previous test already baselined this migrationsSchema/table pair.
		const result = await baselineExistingDatabase(database, {
			migrationsSchema,
			migrationsTable,
			checkSchema,
			checkTable,
		});

		expect(result).toEqual({ outcome: 'already-tracked' });

		const rows = await database.execute<{ count: string }>(
			sql`SELECT count(*)::text AS count FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
		);
		expect(rows.rows[0]?.count).toBe('1');
	});

	it('throws when the default migration tag is not in the checked-in journal', async () => {
		await expect(
			baselineExistingDatabase(database, {
				migrationsSchema: `${migrationsSchema}_bad_tag`,
				migrationsTable,
				checkSchema,
				checkTable: `${checkTable}_bad_tag`,
				migrationTag: 'this_tag_does_not_exist',
			}),
		).rejects.toThrow(/is not listed in/);
	});
});
