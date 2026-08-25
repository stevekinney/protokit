import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { count, eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import {
	obtainRealAccessToken,
	runAuthenticatedInspectorCheck,
	selfHostLocally,
} from '@web/connector-smoke-inspector';

/**
 * Real Postgres, real self-hosted local server. `--isolate` (this
 * application's `test` script) runs this file in its own fresh module
 * registry, so mocking `@modelcontextprotocol/client` here cannot leak into
 * any other test file.
 *
 * Review finding (P2): once `obtainRealAccessToken` succeeded (a real
 * seeded user, confidential client, session, access token, and refresh
 * token), a failure in `client.connect`/`listTools`/`callTool`/`client.close`
 * used to skip `cleanup()` entirely, leaving every one of those rows behind.
 * These tests count matching `oauth_clients` rows before and after a forced
 * failure to prove the rows are gone, not just that the function "handled"
 * the error.
 *
 * One server is shared across all three cases rather than one per case.
 * `selfHostLocally()` costs roughly 435ms, and each test here already spends
 * most of its budget on a real OAuth handshake against a real database, which
 * put the slowest case over `bun test`'s 5000ms default on CI's slower I/O.
 * Sharing the listener changes nothing any case proves -- each still seeds its
 * own rows, runs its own handshake, and asserts its own before/after counts --
 * it only stops paying for the same startup three times.
 */
let baseUrl: string;
let stopServer: () => void;

beforeAll(async () => {
	({ baseUrl, stop: stopServer } = await selfHostLocally());
});

afterAll(() => {
	stopServer();
});

afterAll(async () => {
	// Belt-and-braces in case a test assertion fails before its own cleanup
	// runs: nothing this file's own seeded rows are named
	// 'Inspector Smoke Test Client' should survive past this file.
	await database
		.delete(schema.oauthClients)
		.where(eq(schema.oauthClients.clientName, 'Inspector Smoke Test Client'));
});

async function countInspectorSmokeClients(): Promise<number> {
	const [row] = await database
		.select({ value: count() })
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientName, 'Inspector Smoke Test Client'));
	return row?.value ?? 0;
}

describe('runAuthenticatedInspectorCheck', () => {
	it('cleans up the seeded user/client rows on the real, successful path', async () => {
		const before = await countInspectorSmokeClients();

		const problems: string[] = [];
		await runAuthenticatedInspectorCheck(baseUrl, problems);

		expect(problems).toEqual([]);
		const after = await countInspectorSmokeClients();
		expect(after).toBe(before);
	});
});

describe('obtainRealAccessToken', () => {
	it('leaves no rows behind when the caller runs its returned cleanup', async () => {
		const before = await countInspectorSmokeClients();
		const { cleanup } = await obtainRealAccessToken(baseUrl);
		expect(await countInspectorSmokeClients()).toBe(before + 1);
		await cleanup();
		expect(await countInspectorSmokeClients()).toBe(before);
	});
});

/**
 * `mock.module` patches Bun's shared module registry for the rest of this
 * process (`PROGRESS.local.md`'s standing `OPEN-5`/`BUG` class), so this
 * describe block -- the only one in this file that mocks
 * `@modelcontextprotocol/client` -- runs last, after every test above that
 * needs the real SDK client has already run.
 */
describe('runAuthenticatedInspectorCheck (MCP client throws after token issuance)', () => {
	it('still cleans up the seeded user/client rows', async () => {
		mock.module('@modelcontextprotocol/client', () => ({
			Client: class {
				async connect(): Promise<void> {
					throw new Error('simulated MCP connect failure for this regression test');
				}
				async close(): Promise<void> {}
			},
			StreamableHTTPClientTransport: class {},
		}));

		const { runAuthenticatedInspectorCheck: checkWithMockedClient } =
			await import('@web/connector-smoke-inspector');

		const before = await countInspectorSmokeClients();

		await expect(checkWithMockedClient(baseUrl, [])).rejects.toThrow(
			'simulated MCP connect failure',
		);

		const after = await countInspectorSmokeClients();
		expect(after).toBe(before);
	});
});
