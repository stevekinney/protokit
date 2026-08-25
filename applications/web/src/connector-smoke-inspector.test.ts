import { afterAll, beforeAll, describe, expect, it, mock } from 'bun:test';
import { count, eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import {
	obtainRealAccessToken,
	runInspectorMcpSession,
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
 * One server is shared across every case rather than one per case, and the
 * successful path is covered by three ordered cases sharing one grant rather
 * than one case doing everything.
 *
 * The reason is budget. Measured on CI: issuing a real token costs ~3.6s and
 * the MCP session ~1.7s, so a single case doing both ran past `bun test`'s
 * 5000ms default while neither half does alone. `beforeAll` is no escape --
 * Bun applies the same timeout to hooks.
 *
 * So the grant is issued once and released once, and each case asserts one
 * property of it: that issuing seeds exactly one client row, that a real MCP
 * session over that token works, and that cleanup removes the row again.
 * Together they prove what the single case did, minus the composition itself,
 * which the error-path case at the bottom still exercises through
 * `runAuthenticatedInspectorCheck`.
 *
 * These three are deliberately order-dependent, which Bun guarantees within a
 * file and which this file already relies on for the `mock.module` block below.
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
	// If a case above failed before the cleanup case ran, release the grant
	// here so its rows never outlive this file.
	await grant?.cleanup();
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

let grant: Awaited<ReturnType<typeof obtainRealAccessToken>> | undefined;
let clientsBeforeGrant = 0;

describe('the real, successful inspector path', () => {
	it('issues a real access token and seeds exactly one client row', async () => {
		clientsBeforeGrant = await countInspectorSmokeClients();
		grant = await obtainRealAccessToken(baseUrl);
		expect(await countInspectorSmokeClients()).toBe(clientsBeforeGrant + 1);
	});

	it('completes a real MCP session with that token', async () => {
		expect(grant).toBeDefined();
		const problems: string[] = [];
		await runInspectorMcpSession(baseUrl, grant!.token, grant!.email, problems);
		expect(problems).toEqual([]);
	});

	it('leaves no rows behind once the caller runs its cleanup', async () => {
		expect(grant).toBeDefined();
		await grant!.cleanup();
		grant = undefined;
		expect(await countInspectorSmokeClients()).toBe(clientsBeforeGrant);
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
	}, 30_000);
});
