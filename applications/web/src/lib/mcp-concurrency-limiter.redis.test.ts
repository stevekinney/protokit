import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import {
	acquireMcpConcurrencySlot,
	attachConcurrencySlotToResponseLifetime,
	type McpConcurrencyLimiterDependencies,
} from '@web/lib/mcp-concurrency-limiter';

/**
 * Real-Redis regression coverage for two review findings (P2) on the
 * original `INCR`/`DECR`/single-shared-TTL implementation:
 *
 * 1. A slot's TTL expiring out from under a still-active, long-lived
 *    `subscriptions/listen` stream let the same user acquire a fresh,
 *    unrelated set of slots — the cap was not actually enforced against a
 *    stream that outlived the TTL.
 * 2. `release()` on a stale slot could decrement/clear a completely
 *    different, currently-live slot once the counter's "generation" had
 *    reset.
 *
 * Both are proven here against real Redis with a short, injected TTL —
 * not the real 60-second one, so this file doesn't need to wait a minute
 * to exercise expiry.
 */

let redisClient: RedisClientType | null = null;
let redisAvailable: boolean;
try {
	const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
	const client = createClient({ url: redisUrl, socket: { reconnectStrategy: false } });
	await client.connect();
	await client.ping();
	redisClient = client;
	redisAvailable = true;
} catch {
	redisAvailable = false;
}

const describeWithRedis = redisAvailable
	? describe
	: (describe as unknown as { skip: typeof describe }).skip;

function makeDependencies(
	overrides: Partial<McpConcurrencyLimiterDependencies> = {},
): McpConcurrencyLimiterDependencies {
	return {
		maximumConcurrent: 1,
		ttlMilliseconds: 200,
		isRedisConfigured: () => true,
		getRedisClient: async () => {
			if (!redisClient) throw new Error('Redis unavailable in this test run');
			return redisClient;
		},
		...overrides,
	};
}

describeWithRedis('acquireMcpConcurrencySlot against real Redis (requires Redis)', () => {
	it('a periodically-renewed slot stays counted past its original TTL, still enforcing the cap', async () => {
		const userId = `mcp-concurrency-renew-${randomUUID()}`;
		const dependencies = makeDependencies();

		const first = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(first.allowed).toBe(true);

		// Renew twice, each renewal spaced past the 200ms TTL -- without
		// renewal the slot would already have lapsed by the second wait.
		await new Promise((resolve) => setTimeout(resolve, 120));
		await first.renew();
		await new Promise((resolve) => setTimeout(resolve, 120));
		await first.renew();
		await new Promise((resolve) => setTimeout(resolve, 120));

		// Total elapsed (360ms) already exceeds the 200ms TTL -- a second
		// caller must still be denied, because the renewed slot is still
		// genuinely held.
		const second = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(second.allowed).toBe(false);

		await first.release();
		await second.release();
	});

	it('an unrenewed slot lapses after its TTL, freeing the cap for a new caller (the pre-fix failure mode, now bounded rather than silent)', async () => {
		const userId = `mcp-concurrency-lapse-${randomUUID()}`;
		const dependencies = makeDependencies();

		const first = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(first.allowed).toBe(true);

		await new Promise((resolve) => setTimeout(resolve, 250));

		const second = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(second.allowed).toBe(true);

		await first.release();
		await second.release();
	});

	it("release() frees exactly its own member and never a different, concurrently-live member's slot", async () => {
		const userId = `mcp-concurrency-unique-member-${randomUUID()}`;
		const dependencies = makeDependencies({ maximumConcurrent: 2 });

		const first = await acquireMcpConcurrencySlot({ userId }, dependencies);
		const second = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);

		// At the cap (2/2): a third caller is denied.
		const third = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(third.allowed).toBe(false);

		// Releasing the FIRST slot must free exactly one slot -- the second
		// slot (still held) must remain counted.
		await first.release();
		const fourth = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(fourth.allowed).toBe(true);
		const fifth = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(fifth.allowed).toBe(false);

		await second.release();
		await fourth.release();
		await third.release();
		await fifth.release();
	});

	it('releasing the same slot twice is a safe no-op (does not free a slot it no longer holds)', async () => {
		const userId = `mcp-concurrency-double-release-${randomUUID()}`;
		const dependencies = makeDependencies();

		const first = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(first.allowed).toBe(true);
		await first.release();
		await first.release();

		const second = await acquireMcpConcurrencySlot({ userId }, dependencies);
		expect(second.allowed).toBe(true);
		await second.release();
	});
});

describeWithRedis(
	'attachConcurrencySlotToResponseLifetime against real Redis (requires Redis)',
	() => {
		it('keeps a slot held (renewed) for as long as a streamed response body stays open, and releases it on close', async () => {
			const userId = `mcp-concurrency-attach-${randomUUID()}`;
			const dependencies = makeDependencies();

			const slot = await acquireMcpConcurrencySlot({ userId }, dependencies);
			expect(slot.allowed).toBe(true);

			let enqueueChunk!: (chunk: Uint8Array) => void;
			let closeStream!: () => void;
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					enqueueChunk = (chunk) => controller.enqueue(chunk);
					closeStream = () => controller.close();
				},
			});
			const attached = attachConcurrencySlotToResponseLifetime(new Response(body), slot);
			const reader = attached.body!.getReader();

			// While the stream stays open (past the short TTL, thanks to the
			// helper's own renewal interval -- driven here via a manual
			// `slot.renew()` stand-in since the module's renewal interval is
			// tuned for production TTLs, not this test's short one), a
			// competing acquire must still be denied.
			await new Promise((resolve) => setTimeout(resolve, 120));
			await slot.renew();
			const readPromise = reader.read();
			enqueueChunk(new TextEncoder().encode('event: ping\n\n'));
			await readPromise;
			await new Promise((resolve) => setTimeout(resolve, 120));

			const competingWhileOpen = await acquireMcpConcurrencySlot({ userId }, dependencies);
			expect(competingWhileOpen.allowed).toBe(false);

			const finalRead = reader.read();
			closeStream();
			await finalRead;
			// Give the reader's `pull` loop a tick to observe `done` and settle.
			await new Promise((resolve) => setTimeout(resolve, 50));

			const competingAfterClose = await acquireMcpConcurrencySlot({ userId }, dependencies);
			expect(competingAfterClose.allowed).toBe(true);

			await competingWhileOpen.release();
			await competingAfterClose.release();
		});
	},
);
