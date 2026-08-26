import { describe, expect, it, beforeEach } from 'bun:test';

import {
	acquireMcpConcurrencySlot,
	attachConcurrencySlotToResponseLifetime,
	resetInMemoryConcurrencyCounts,
	type McpConcurrencyLimiterDependencies,
	type McpConcurrencySlot,
} from '@web/lib/mcp-concurrency-limiter';

// OPEN-5: this file used to drive `acquireMcpConcurrencySlot` through
// `mock.module('@web/env', ...)` / `mock.module('@web/lib/redis-client', ...)`.
// Bun's `mock.module` is global and is never restored at file boundaries, so
// those mocks leaked into whatever ran after this file in the same test
// process. `acquireMcpConcurrencySlot` now takes an injectable dependencies
// object instead — see `mcp-concurrency-limiter.ts` — so this file passes a
// plain object directly, with nothing global to leak.
const testDependencies: McpConcurrencyLimiterDependencies = {
	maximumConcurrent: 2,
	isRedisConfigured: () => false,
	getRedisClient: async () => {
		throw new Error('should not be called when Redis is not configured');
	},
};

describe('acquireMcpConcurrencySlot', () => {
	beforeEach(() => {
		resetInMemoryConcurrencyCounts();
	});

	it('allows requests up to the configured maximum', async () => {
		const first = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		const second = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
	});

	it('denies a request once the maximum concurrent slots are held', async () => {
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		const third = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		expect(third.allowed).toBe(false);
	});

	it('frees a slot on release, allowing a subsequent request through', async () => {
		const first = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await first.release();

		const third = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		expect(third.allowed).toBe(true);
	});

	it('scopes concurrency slots by user', async () => {
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		const otherUser = await acquireMcpConcurrencySlot({ userId: 'user-2' }, testDependencies);
		expect(otherUser.allowed).toBe(true);
	});

	it('releasing a denied slot is a safe no-op', async () => {
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		const denied = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await denied.release();

		const afterNoOpRelease = await acquireMcpConcurrencySlot(
			{ userId: 'user-1' },
			testDependencies,
		);
		expect(afterNoOpRelease.allowed).toBe(false);
	});

	it('falls back to the real, module-level dependencies when none are injected', async () => {
		// Exercises `liveMcpConcurrencyLimiterDependencies`, in particular its
		// `maximumConcurrent` getter reading `environment.rateLimitMcpConcurrentMax`
		// -- the default-parameter path production call sites actually use.
		// Redis isn't configured for this test process (no REDIS_URL wiring
		// via `@web/env`'s `isRedisConfigured`), so this exercises the
		// in-memory fallback branch of the real dependencies object.
		const slot = await acquireMcpConcurrencySlot({ userId: `default-deps-${Date.now()}` });
		expect(typeof slot.allowed).toBe('boolean');
		await slot.release();
	});
});

describe('acquireMcpConcurrencySlot Redis error handling', () => {
	function makeThrowingRedisDependencies(
		overrides: Partial<{
			zRem: () => Promise<number>;
			eval: () => Promise<number>;
		}> = {},
	): McpConcurrencyLimiterDependencies {
		const fakeRedisClient = {
			eval: overrides.eval ?? (async () => 1),
			zRem: overrides.zRem ?? (async () => 1),
		};
		return {
			maximumConcurrent: 5,
			isRedisConfigured: () => true,
			getRedisClient: async () => fakeRedisClient as never,
		};
	}

	it('release() swallows a Redis zRem failure instead of throwing', async () => {
		const dependencies = makeThrowingRedisDependencies({
			zRem: async () => {
				throw new Error('zrem failed');
			},
		});
		const slot = await acquireMcpConcurrencySlot({ userId: 'user-throwing' }, dependencies);
		expect(slot.allowed).toBe(true);
		expect(await slot.release()).toBeUndefined();
	});

	it('renew() swallows a Redis eval failure instead of throwing', async () => {
		let evalCallCount = 0;
		const dependencies = makeThrowingRedisDependencies({
			eval: async () => {
				evalCallCount++;
				if (evalCallCount === 1) return 1; // the acquire call
				throw new Error('renew eval failed');
			},
		});
		const slot = await acquireMcpConcurrencySlot({ userId: 'user-throwing-renew' }, dependencies);
		expect(slot.allowed).toBe(true);
		expect(await slot.renew()).toBeUndefined();
	});
});

describe('attachConcurrencySlotToResponseLifetime', () => {
	function makeFakeSlot(): McpConcurrencySlot & { releaseCount: number; renewCount: number } {
		const slot = {
			allowed: true,
			releaseCount: 0,
			renewCount: 0,
			release: async () => {
				slot.releaseCount++;
			},
			renew: async () => {
				slot.renewCount++;
			},
		};
		return slot;
	}

	it('releases the slot immediately for a response with a null body', () => {
		const slot = makeFakeSlot();
		const response = attachConcurrencySlotToResponseLifetime(new Response(null), slot);
		expect(response.body).toBeNull();
		expect(slot.releaseCount).toBe(1);
	});

	it('releases the slot immediately for a response whose body was already consumed', async () => {
		const slot = makeFakeSlot();
		const original = new Response('already read');
		await original.text();
		expect(original.bodyUsed).toBe(true);

		const response = attachConcurrencySlotToResponseLifetime(original, slot);
		expect(response).toBe(original);
		expect(slot.releaseCount).toBe(1);
	});

	it('releases the slot when the underlying stream errors instead of closing cleanly', async () => {
		const slot = makeFakeSlot();
		let failSource!: (error: unknown) => void;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				failSource = (error) => controller.error(error);
			},
		});

		const attached = attachConcurrencySlotToResponseLifetime(new Response(body), slot);
		const reader = attached.body!.getReader();
		const readPromise = reader.read();
		failSource(new Error('stream exploded'));

		await expect(readPromise).rejects.toThrow('stream exploded');
		expect(slot.releaseCount).toBe(1);
	});

	it('releases the slot when the consumer cancels the stream', async () => {
		const slot = makeFakeSlot();
		const body = new ReadableStream<Uint8Array>({
			start() {
				// Never closes on its own -- only cancellation ends this stream.
			},
		});

		const attached = attachConcurrencySlotToResponseLifetime(new Response(body), slot);
		await attached.body!.cancel('client disconnected');

		expect(slot.releaseCount).toBe(1);
	});

	it('calls slot.renew() on the renewal interval while the stream stays open', async () => {
		const slot = makeFakeSlot();
		const originalSetInterval = globalThis.setInterval;
		let capturedCallback: (() => void) | undefined;
		globalThis.setInterval = ((callback: () => void) => {
			capturedCallback = callback;
			return 0 as unknown as ReturnType<typeof setInterval>;
		}) as typeof setInterval;

		let closeStream!: () => void;
		try {
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					closeStream = () => controller.close();
				},
			});
			attachConcurrencySlotToResponseLifetime(new Response(body), slot);
		} finally {
			globalThis.setInterval = originalSetInterval;
		}

		expect(capturedCallback).toBeDefined();
		capturedCallback!();
		// `slot.renew()` is fired-and-forgotten (`void slot.renew()`), so wait
		// a tick for the microtask to run.
		await Promise.resolve();
		expect(slot.renewCount).toBe(1);

		closeStream();
	});
});
