import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import {
	Client,
	SdkError,
	SdkErrorCode,
	StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMcpServer } from './server.js';
import { getSupportedScopes } from './supported-scopes.js';
import type { McpUserProfile } from './types/primitives.js';
import { templateRegistry } from './template-registry.js';

/**
 * TEST-001 (OPEN-10) regression test.
 *
 * `.github/conformance/legacy-expected-failures.yaml` documents that
 * `tools-call-sampling` and its three sibling scenarios always time out
 * against the pinned conformance CLI, because that CLI's `server`-mode test
 * client never implements a `sampling/createMessage` responder. The open
 * question INTEROP-001 left behind was whether the server-side await
 * (`conformance-fixture-registration.ts`'s `sendRequest` call, made with no
 * explicit `options.timeout`) is genuinely unbounded -- which would make a
 * real client with slow human-in-the-loop elicitation able to hang a
 * request indefinitely, an availability defect.
 *
 * It is not unbounded. `@modelcontextprotocol/server`'s
 * `requestWithSchemaViaCodec` falls back to the SDK's own
 * `DEFAULT_REQUEST_TIMEOUT_MSEC` (60000ms) whenever the caller omits
 * `timeout`, confirmed both by reading `core-internal/src/shared/
 * protocol.ts` and by timing a real CLI run against this exact server
 * (`bunx --bun @modelcontextprotocol/conformance server --scenario
 * tools-call-sampling --verbose` measured `1:00.49` wall-clock before the
 * failure). This test proves the same bound end to end against this
 * repository's own server, using a real client that declares the
 * `sampling` capability and registers a handler that deliberately never
 * resolves -- the exact "slow human-in-the-loop" shape the roadmap worried
 * about. If a future SDK upgrade removes the default (making the await
 * genuinely unbounded again), this test times out and fails loudly instead
 * of silently reintroducing the availability gap.
 */

function conformanceUser(userId: string): McpUserProfile {
	return {
		id: userId,
		email: 'conformance@localhost',
		name: 'Conformance User',
		image: null,
		role: 'user',
	};
}

const handler = createMcpHandler(
	() => {
		const userId = randomUUID();
		return createMcpServer(
			{
				userId,
				user: conformanceUser(userId),
				enableUiExtension: false,
				enableConformanceMode: true,
				scopes: getSupportedScopes(templateRegistry),
			},
			templateRegistry,
		);
	},
	{ legacy: 'stateless' },
);

async function fetchThroughHandler(input: string | URL, init?: RequestInit): Promise<Response> {
	return handler.fetch(new Request(input, init));
}

describe('server-initiated sampling requests are bounded by the SDK default timeout', () => {
	it(
		'a sampling handler that never resolves still fails the tool call in roughly 60s, not never',
		async () => {
			const client = new Client(
				{ name: 'never-responds-sampling-client', version: '1.0.0' },
				{ capabilities: { sampling: {} } },
			);
			// Deliberately never resolves or rejects -- simulates a real
			// client whose human-in-the-loop sampling handler is slow, not a
			// client that lacks the capability entirely (that path already
			// has coverage via the graceful `isError: true` fallback for
			// clients with no `sendRequest` support at all).
			client.setRequestHandler('sampling/createMessage', () => new Promise(() => {}));

			const transport = new StreamableHTTPClientTransport(new URL('http://conformance.local/mcp'), {
				fetch: fetchThroughHandler,
			});
			await client.connect(transport);

			const startedAt = Date.now();
			// The client's OWN `tools/call` request has the same ~60s SDK
			// default as the server's inner `sampling/createMessage` request,
			// and both clocks start within milliseconds of each other. A real
			// client in this shape can therefore observe either of two
			// equally-bounded outcomes, depending on which 60s timer fires
			// first: the server's own graceful `isError: true` result, or the
			// client's outer `tools/call` request rejecting with `SdkError`
			// (`RequestTimeout`). Both prove the same thing -- neither await is
			// unbounded -- so this test accepts either rather than trying to
			// force one specific winner of a race between two independent
			// clocks carrying the same default.
			let isBoundedError: boolean;
			try {
				const result = await client.callTool({
					name: 'test_sampling',
					arguments: { prompt: 'never answered' },
				});
				isBoundedError = result.isError === true;
			} catch (error) {
				isBoundedError = error instanceof SdkError && error.code === SdkErrorCode.RequestTimeout;
			}
			const elapsedMilliseconds = Date.now() - startedAt;

			expect(isBoundedError).toBe(true);
			// A finite, well-defined bound: not the immediate-rejection path
			// (that path resolves in well under a second when sampling isn't
			// supported at all), and not "still running" -- comfortably below
			// this test's own timeout. Asserting a floor as well as a ceiling
			// distinguishes "bounded at ~60s" from "bounded at some much
			// shorter, undocumented value" -- either would be a real change in
			// the SDK's behavior worth knowing about.
			expect(elapsedMilliseconds).toBeGreaterThan(45_000);
			expect(elapsedMilliseconds).toBeLessThan(90_000);

			await client.close().catch(() => {});
		},
		{ timeout: 90_000 },
	);
});
