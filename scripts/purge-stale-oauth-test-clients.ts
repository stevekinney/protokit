/**
 * OPEN-11: registration tests created `oauth_clients` rows through the real
 * `POST /oauth/register` endpoint and never removed them, accumulating
 * thousands of rows in the shared local test database. The leak itself is
 * closed at its source — `applications/web/src/test-support/start-test-server.ts`
 * schedules cleanup for every client a test registers through the shared
 * fetch helper — but that does nothing about rows already accumulated. This
 * removes them.
 *
 * Two safety properties, both load-bearing:
 *
 * It refuses to run against anything but the local fixture database. The
 * connection string must name `protokit_test`, the database `docker-compose.test.yml`
 * creates. There is no flag to override that.
 *
 * It only deletes rows older than `STALE_AGE_MINUTES`. `applications/web`'s
 * suite runs with `--isolate`, so several test processes share this database
 * concurrently; deleting by name pattern alone would delete another running
 * suite's live fixture out from under it. The age floor means a row belonging
 * to a run in progress is never a candidate.
 */
import { sql } from 'drizzle-orm';
import { database } from '@template/database';
import { environment as databaseEnvironment } from '@template/database/env';

/** Rows younger than this may belong to a suite that is running right now. */
const STALE_AGE_MINUTES = 60;

/**
 * `client_name` values the checked-in suites create. Deliberately an explicit
 * list rather than a catch-all: a row this script does not recognize is a row
 * a human should look at, not one it should quietly delete.
 */
const TEST_FIXTURE_CLIENT_NAME_PATTERNS = [
	'multi-replica-rate-limit-test%',
	'Revocation RFC 7009 Test Client%',
	'Private Cache Test Client%',
	'Inspector Smoke Test Client%',
	'Registration Cleanup Guard%',
	'rotation-revocation-test-client%',
	'consent-inventory-test-client%',
];

export function isLocalTestDatabase(connectionString: string | undefined): boolean {
	if (!connectionString) return false;
	try {
		const { pathname } = new URL(connectionString);
		return pathname.replace(/^\//, '') === 'protokit_test';
	} catch {
		return false;
	}
}

export async function purgeStaleOauthTestClients(): Promise<number> {
	const { rows } = await database.execute<{ deleted: string }>(sql`
		WITH removed AS (
			DELETE FROM oauth_clients
			WHERE created_at < now() - ${`${STALE_AGE_MINUTES} minutes`}::interval
				AND client_name LIKE ANY (${sql.raw(
					`ARRAY[${TEST_FIXTURE_CLIENT_NAME_PATTERNS.map((pattern) => `'${pattern.replace(/'/g, "''")}'`).join(', ')}]`,
				)})
			RETURNING client_id
		)
		SELECT count(*)::text AS deleted FROM removed
	`);
	return Number(rows[0]?.deleted ?? 0);
}

async function main(): Promise<void> {
	if (!isLocalTestDatabase(databaseEnvironment.DATABASE_URL)) {
		console.error(
			'[purge-stale-oauth-test-clients] refusing to run: DATABASE_URL does not name the local ' +
				'`protokit_test` fixture database. This script only ever cleans up after the local test ' +
				'stack (docker-compose.test.yml).',
		);
		process.exit(1);
	}

	const deleted = await purgeStaleOauthTestClients();
	console.log(
		`[purge-stale-oauth-test-clients] removed ${deleted} stale test fixture client(s) older than ` +
			`${STALE_AGE_MINUTES} minutes.`,
	);
}

if (import.meta.main) {
	await main();
}
