import { describe, expect, it } from 'bun:test';
import { isLocalTestDatabase } from './purge-stale-oauth-test-clients';

describe('isLocalTestDatabase', () => {
	it('accepts the real local fixture connection string', () => {
		expect(isLocalTestDatabase('postgresql://protokit:protokit@localhost:5432/protokit_test')).toBe(
			true,
		);
	});

	it('accepts the db.localtest.me alias for the same fixture', () => {
		expect(
			isLocalTestDatabase('postgresql://protokit:protokit@db.localtest.me:5432/protokit_test'),
		).toBe(true);
	});

	it('accepts a connection string with no explicit port, defaulting to 5432', () => {
		expect(isLocalTestDatabase('postgresql://protokit:protokit@localhost/protokit_test')).toBe(
			true,
		);
	});

	/**
	 * Review finding (P1): a remote or hosted database happening to be named
	 * `protokit_test` used to pass this guard on database name alone, letting
	 * `purgeStaleOauthTestClients`'s real `DELETE` run against it.
	 */
	it('rejects a remote host even when the database is named protokit_test', () => {
		expect(
			isLocalTestDatabase('postgresql://user:pass@some-shared-host.example.com:5432/protokit_test'),
		).toBe(false);
	});

	it('rejects a non-standard port on an otherwise-local host', () => {
		expect(isLocalTestDatabase('postgresql://protokit:protokit@localhost:5433/protokit_test')).toBe(
			false,
		);
	});

	it('rejects a local host with a different database name', () => {
		expect(isLocalTestDatabase('postgresql://protokit:protokit@localhost:5432/production')).toBe(
			false,
		);
	});

	it('rejects an undefined connection string', () => {
		expect(isLocalTestDatabase(undefined)).toBe(false);
	});

	it('rejects a malformed connection string', () => {
		expect(isLocalTestDatabase('not-a-url')).toBe(false);
	});
});
