import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_MIGRATIONS_FOLDER = join(import.meta.dirname, '..', 'drizzle');
const DEFAULT_BASELINE_TAG = '0000_wet_leopardon';

export interface BaselineExistingDatabaseOptions {
	/** Directory containing the generated Drizzle migrations. Defaults to `packages/database/drizzle`. */
	migrationsFolder?: string;
	/** Journal tag of the migration to baseline. Defaults to this repository's `0000_wet_leopardon` baseline. */
	migrationTag?: string;
	/** Schema drizzle-orm's migrator tracks applied migrations in. Must match its own default unless the caller also overrides `migrationsSchema` on every real `migrate()` call. */
	migrationsSchema?: string;
	/** Table drizzle-orm's migrator tracks applied migrations in. */
	migrationsTable?: string;
	/** Schema of a table the baseline migration creates, used to tell "these tables already exist" apart from "this is a genuinely empty database". */
	checkSchema?: string;
	/** A table the baseline migration creates. */
	checkTable?: string;
}

export type BaselineOutcome =
	| { outcome: 'baselined'; hash: string; createdAt: number }
	| { outcome: 'already-tracked' }
	| { outcome: 'fresh-database' };

/**
 * Marks the baseline migration (`0000_wet_leopardon` by default) as already
 * applied without running its SQL, for a database whose tables already exist
 * from before this repository tracked Drizzle migrations at all.
 *
 * Context (see `.roadmap-progress/DEPLOY-001.md`): `drizzle.config.ts`
 * pointed at a migrations directory that did not exist from this project's
 * first commit through `DEPLOY-001`, which generated `drizzle/0000_wet_leopardon.sql`
 * as a one-shot snapshot of `schema.ts` as it stood at that point. Any
 * database that already has these tables from before that commit (for
 * example, an instantiator who forked this template and deployed it before
 * `DEPLOY-001` landed) has no `drizzle.__drizzle_migrations` row for 0000.
 * Running `drizzle-orm`'s `migrate()` against it unmodified re-issues 0000's
 * `CREATE TABLE` statements and fails with "relation already exists",
 * blocking the `migrate` job in `production.yml` before `deploy` can run.
 *
 * This function never runs the baseline migration's SQL and never touches
 * later migrations (0001+); it only pre-populates the tracking table that
 * `migrate()` reads, so a subsequent real `migrate()` call skips 0000 and
 * applies 0001 onward exactly as it would for a database that legitimately
 * already had 0000 applied.
 *
 * Safe to call repeatedly: once anything is tracked, it is a no-op
 * (`already-tracked`).
 *
 * The `fresh-database` check is a coarse guard against the one case that is
 * always unsafe to baseline — a database with none of these tables at all —
 * not a substitute for verifying the rest of the schema. Confirming that an
 * existing database's shape actually matches `drizzle/meta/0000_snapshot.json`
 * (not just that `oauth_clients` happens to exist) is an operator judgment
 * call this function deliberately does not make: see
 * `packages/database/CLAUDE.md`'s "Baselining a database that predates
 * tracked migrations" section for why that comparison can't be automated
 * here (this repository's schema changed shape multiple times before
 * `drizzle/` existed, so "the tables are there" does not imply "they match
 * migration 0000's definition exactly").
 */
export async function baselineExistingDatabase(
	database: Pick<NeonHttpDatabase, 'execute'>,
	options: BaselineExistingDatabaseOptions = {},
): Promise<BaselineOutcome> {
	const migrationsFolder = options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
	const migrationTag = options.migrationTag ?? DEFAULT_BASELINE_TAG;
	const migrationsSchema = options.migrationsSchema ?? 'drizzle';
	const migrationsTable = options.migrationsTable ?? '__drizzle_migrations';
	const checkSchema = options.checkSchema ?? 'public';
	const checkTable = options.checkTable ?? 'oauth_clients';

	const journalPath = join(migrationsFolder, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(journalPath, 'utf-8')) as {
		entries: { tag: string; when: number }[];
	};
	const entry = journal.entries.find((candidate) => candidate.tag === migrationTag);
	if (!entry) {
		throw new Error(`Migration "${migrationTag}" is not listed in ${journalPath}`);
	}

	// Hash the migration file the same way drizzle-orm's own migrator does
	// (sha256 of the raw file contents) so the row this writes is
	// indistinguishable from one `migrate()` would have written itself.
	const migrationSql = readFileSync(join(migrationsFolder, `${migrationTag}.sql`), 'utf-8');
	const hash = createHash('sha256').update(migrationSql).digest('hex');

	await database.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);
	await database.execute(sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)
	`);

	const trackedRows = await database.execute<{ count: string }>(
		sql`SELECT count(*)::text AS count FROM ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`,
	);
	if (Number(trackedRows.rows[0]?.count ?? '0') > 0) {
		return { outcome: 'already-tracked' };
	}

	const tableExists = await database.execute<{ exists: boolean }>(sql`
		SELECT EXISTS (
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = ${checkSchema} AND table_name = ${checkTable}
		) AS exists
	`);
	if (!tableExists.rows[0]?.exists) {
		return { outcome: 'fresh-database' };
	}

	await database.execute(
		sql`INSERT INTO ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (hash, created_at) VALUES (${hash}, ${entry.when})`,
	);

	return { outcome: 'baselined', hash, createdAt: entry.when };
}
