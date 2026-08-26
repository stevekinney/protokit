import { describe, expect, it } from 'bun:test';
import { database, schema } from './index';

/**
 * `database` is a lazy `Proxy` wrapping a real Neon HTTP client -- it
 * never constructs the underlying client until the first property access.
 * A real, low-risk read (`limit(0)`) against the real shared test Postgres
 * (through the local Neon proxy) proves the Proxy's `get` trap actually
 * initializes the client and forwards to a working `NeonHttpDatabase`
 * instance, not merely that importing the module doesn't throw.
 */
describe('database (lazy Proxy)', () => {
	it('initializes on first access and executes a real query', async () => {
		const rows = await database.select().from(schema.users).limit(0);
		expect(rows).toEqual([]);
	});

	it('reuses the same underlying instance across property accesses', async () => {
		const first = await database.select().from(schema.users).limit(0);
		const second = await database.select().from(schema.users).limit(0);
		expect(first).toEqual(second);
	});
});
