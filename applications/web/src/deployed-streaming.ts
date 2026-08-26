#!/usr/bin/env bun
/**
 * `OPS-001`: `bun run test:deployed-streaming -- https://HOST/mcp --token-file PATH`
 *
 * Proves the acceptance criterion "a request-scoped SSE response is not
 * buffered by the production proxy" against a real, deployed host --
 * something that structurally cannot be proven against a local self-hosted
 * server, because the whole point is to observe whatever reverse proxy,
 * load balancer, or CDN sits in front of the real deployment (the thing a
 * local `Bun.serve()` instance never has).
 *
 * Needs a real bearer token for a real deployment -- run
 * `bun run test:deployed-oauth -- https://HOST` first and follow its
 * printed manual-completion steps to get one; there is no way to automate
 * past a real host's human browser OAuth consent screen.
 *
 * Uses the real `@modelcontextprotocol/client` SDK -- the same one every
 * other integration test in this repository drives a real server through
 * -- to negotiate the modern (`2026-07-28`) era and open a genuine
 * `subscriptions/listen` request-scoped SSE stream, rather than
 * hand-rolling the wire protocol. Confirmed empirically (not assumed) that
 * a bare `GET /mcp` is rejected outright (405) by this server's own
 * transport configuration, and that a raw `subscriptions/listen` POST
 * needs several exact protocol-envelope details (an `Mcp-Method` header,
 * a `_meta` envelope carrying the negotiated protocol version and client
 * capabilities) that the SDK already gets right -- reinventing that by
 * hand here would be exactly the kind of untested protocol assumption
 * this branch's history warns about.
 *
 * A thin `fetch` wrapper attached to the SDK's own transport records the
 * real wall-clock arrival time of every raw byte chunk the underlying
 * HTTP response delivers, before the SDK ever parses them into JSON-RPC
 * messages -- `detectStreamBuffering` (unit-tested in
 * `deployed-validation-support.test.ts` against both a buffered and an
 * unbuffered timing fixture) turns those timestamps into a pass/fail
 * verdict.
 */

import { readFileSync } from 'node:fs';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { detectStreamBuffering } from '@web/deployed-validation-support';
import { runHarnessMain } from '@web/connector-smoke-support';

/**
 * Review finding (P2, `deployed-oauth.ts:387`): a bearer token handed to
 * this script as a bare `--token BEARER_TOKEN` argument lands in this
 * process's own argv (visible to any other process on the host via `ps`,
 * and in this run's shell history) for the token's entire lifetime.
 * `deployed-oauth.ts` now delivers a freshly obtained token through a
 * mode-0600 file rather than printing it inline, so `--token-file PATH` is
 * the primary, recommended form; `--token BEARER_TOKEN` remains supported
 * for a human pasting a token they already have some other way, which
 * carries the same argv exposure regardless of how this script reads it.
 */
export function parseArguments(argv: readonly string[]): { mcpUrl: string; token: string } {
	const mcpUrl = argv[0];
	const tokenFlagIndex = argv.indexOf('--token');
	const tokenFileFlagIndex = argv.indexOf('--token-file');

	let token: string | undefined;
	if (tokenFileFlagIndex !== -1) {
		const tokenFilePath = argv[tokenFileFlagIndex + 1];
		token = tokenFilePath ? readFileSync(tokenFilePath, 'utf-8').trim() : undefined;
	} else if (tokenFlagIndex !== -1) {
		token = argv[tokenFlagIndex + 1];
	}

	if (!mcpUrl || !token) {
		console.error(
			'[deployed-streaming] usage: bun run test:deployed-streaming -- https://HOST/mcp --token-file PATH',
		);
		console.error(
			'[deployed-streaming]    or: bun run test:deployed-streaming -- https://HOST/mcp --token BEARER_TOKEN',
		);
		console.error(
			'[deployed-streaming] obtain a token by running: bun run test:deployed-oauth -- https://HOST',
		);
		process.exit(1);
	}

	return { mcpUrl, token };
}

/**
 * `@modelcontextprotocol/server`'s Streamable HTTP transport sends no
 * initial event on a `subscriptions/listen` stream -- only a
 * `: keepalive` SSE comment frame on a fixed `setInterval`,
 * `DEFAULT_SSE_KEEP_ALIVE_MS` (15000ms, confirmed by reading the
 * installed `@modelcontextprotocol/server` package source directly
 * rather than assuming a value). Observing two of them needs waiting
 * through slightly more than two full intervals.
 */
const serverKeepAliveMs = 15_000;
const collectDeadlineMs = serverKeepAliveMs * 2 + 10_000;

async function main(): Promise<void> {
	const { mcpUrl, token } = parseArguments(process.argv.slice(2));

	const chunkTimings: Array<{ receivedAtMs: number }> = [];
	// Only the `subscriptions/listen` response's own chunks may count toward
	// the buffering verdict. `client.connect()` makes its own POST request
	// first (the `initialize` handshake) whose response chunks would
	// otherwise land in the same array -- since `detectStreamBuffering` looks
	// at the LARGEST inter-chunk gap, mixing in an unrelated, immediately-
	// arriving response would make a genuinely fully-buffered listen stream
	// (nothing arrives until the deadline) misread as "unbuffered": the huge
	// gap between the connect response and the deadline still looks like a
	// real keep-alive interval. Recording starts only once `listen()` is
	// about to be called, when no other request is concurrently in flight.
	let recordingListenChunks = false;

	const client = new Client(
		{ name: 'protokit-deployed-streaming-smoke', version: '1.0.0' },
		{ versionNegotiation: { mode: { pin: '2026-07-28' } } },
	);
	const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
		fetch: async (input, init) => {
			const headers = new Headers(init?.headers);
			headers.set('authorization', `Bearer ${token}`);
			const response = await fetch(input, { ...init, headers });
			if (!response.body || !recordingListenChunks) return response;

			// Records the real arrival time of every raw chunk this response
			// delivers, then passes it through unmodified -- the SDK still
			// gets exactly the bytes it would have gotten without this wrapper.
			const timedBody = response.body.pipeThrough(
				new TransformStream<Uint8Array, Uint8Array>({
					transform(chunk, controller) {
						if (chunk.byteLength > 0) chunkTimings.push({ receivedAtMs: Date.now() });
						controller.enqueue(chunk);
					},
				}),
			);
			return new Response(timedBody, { status: response.status, headers: response.headers });
		},
	});

	console.log(`[deployed-streaming] connecting to ${mcpUrl}...`);
	await client.connect(transport);
	if (client.getProtocolEra() !== 'modern') {
		console.error(
			`[deployed-streaming] FAILED: negotiated era "${client.getProtocolEra()}", expected "modern" -- this deployment does not support subscriptions/listen (2026-07-28 only).`,
		);
		process.exit(1);
	}
	console.log('[deployed-streaming] connected, negotiated the modern (2026-07-28) era');

	console.log('[deployed-streaming] opening the subscriptions/listen SSE stream...');
	recordingListenChunks = true;
	const subscription = await client.listen({ resourceSubscriptions: ['user://profile'] });
	console.log('[deployed-streaming] subscription open; recording raw chunk arrival timestamps...');
	console.log(
		'[deployed-streaming] a server-side keep-alive cadence is what this measures -- no client-side action is needed for at least two chunks to arrive on a correctly configured deployment.',
	);

	const startedAtMs = Date.now();
	while (Date.now() - startedAtMs < collectDeadlineMs && chunkTimings.length < 4) {
		await Bun.sleep(250);
	}

	await subscription.close().catch(() => {});
	await client.close().catch(() => {});

	if (chunkTimings.length < 2) {
		console.error(
			`[deployed-streaming] FAILED: only ${chunkTimings.length} chunk(s) arrived within ${collectDeadlineMs}ms -- cannot measure inter-chunk timing. Confirm the deployment path genuinely delivers a stream rather than closing or buffering it entirely before any bytes arrive.`,
		);
		process.exit(1);
	}

	const bufferingResult = detectStreamBuffering(chunkTimings, serverKeepAliveMs);
	console.log(`[deployed-streaming] ${bufferingResult.reason}`);

	if (bufferingResult.buffered) {
		console.error(
			"[deployed-streaming] FAILED: the deployment path appears to buffer this SSE response rather than streaming it -- check the reverse proxy/load balancer configuration for response buffering on text/event-stream, and its idle timeout against this server's own (60s, see server.ts).",
		);
		process.exit(1);
	}

	console.log('');
	console.log(
		'[deployed-streaming] the deployed proxy does not buffer a request-scoped SSE response.',
	);
	process.exit(0);
}

// Sibling defect found while adding this file's own unit test (round-16
// review, thread 7): this file was missing the `import.meta.main` guard
// its siblings (`deployed-oauth.ts`, `deployed-smoke.ts`) both have.
// Without it, merely `import`-ing this module (e.g. from a test file, to
// unit test the pure `parseArguments` above) ran the real `main()` against
// `process.argv`, which `process.exit(1)`s the whole test process.
if (import.meta.main) {
	await runHarnessMain('deployed-streaming', main);
}
