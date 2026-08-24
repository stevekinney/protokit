import { describe, expect, it } from 'bun:test';
import { runMigrations } from './migrate';

/**
 * `runMigrations` applies every pending migration in `drizzle/` to the
 * shared test Postgres instance through the local Neon HTTP proxy
 * (`bun run test:infrastructure:migrate` already fully migrates it before
 * this suite runs). Drizzle's migrator only applies migration files newer
 * than what it already has tracked in `__drizzle_migrations`, so calling
 * this for real against an already-migrated database is a safe no-op --
 * exactly what this test proves: it resolves without throwing, against
 * the real database, not a mock.
 */
describe('runMigrations', () => {
	it('applies pending migrations against the real database without throwing', async () => {
		await expect(runMigrations()).resolves.toBeUndefined();
	});
});
