import { neon } from '@neondatabase/serverless';
import { baselineExistingDatabase } from '@template/database/baseline';
import { environment } from '@template/database/env';
import { applyLocalProxyFetchEndpoint } from '@template/database/local-proxy';
import { drizzle } from 'drizzle-orm/neon-http';

/**
 * Operator runbook step for upgrading a database that already had these
 * tables before this repository tracked Drizzle migrations (see
 * `packages/database/src/baseline.ts` for the full explanation and
 * `.roadmap-progress/F-migration-baseline.md` for the review thread this
 * closes).
 *
 * Run this ONCE, before the first `bun scripts/migrate.ts` against a
 * database that predates `drizzle/0000_wet_leopardon.sql` — for example, a
 * production database created by an earlier fork of this template before
 * `DEPLOY-001` added migration tracking. Do NOT run this against a fresh
 * database: it detects that case (`fresh-database`) and refuses to act, so
 * `migrate.ts` creates the schema for real instead.
 *
 * Idempotent: safe to run again, including against a database this has
 * already baselined or that has since been migrated normally.
 */
async function main() {
	const databaseUrl = environment.databaseUrlUnpooled || environment.databaseUrl;

	applyLocalProxyFetchEndpoint(environment.databaseLocalProxyUrl);

	const sql = neon(databaseUrl);
	const database = drizzle(sql);

	const result = await baselineExistingDatabase(database);

	switch (result.outcome) {
		case 'baselined': {
			console.log(
				`Baselined migration 0000 (hash ${result.hash}, created_at ${result.createdAt}). ` +
					'It will not be re-applied. Run `bun scripts/migrate.ts` now to apply 0001 onward.',
			);
			break;
		}
		case 'already-tracked': {
			console.log(
				'drizzle.__drizzle_migrations already has rows on this database — nothing to baseline. ' +
					'Run `bun scripts/migrate.ts` normally.',
			);
			break;
		}
		case 'fresh-database': {
			console.log(
				'No existing "oauth_clients" table found on this database — this looks like a fresh ' +
					'database, not one that needs baselining. Run `bun scripts/migrate.ts` normally; it ' +
					'will create migration 0000 for real.',
			);
			break;
		}
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
