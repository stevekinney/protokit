import { describe, expect, it } from 'bun:test';
import type {
	ConcurrencySlotStore,
	MinimalRedisClient,
	RateLimitConfiguration,
} from '../oauth/index.js';
import {
	attachConcurrencySlotToResponseLifetime,
	createInMemoryConcurrencySlotStore,
	createInMemorySlidingWindowStore,
	createRateLimitedResponse,
	createRedisConcurrencySlotStore,
	createRedisSlidingWindowStore,
	DEFAULT_CONCURRENCY_SLOT_RENEWAL_INTERVAL_MILLISECONDS,
	DEFAULT_CONCURRENCY_SLOT_TTL_MILLISECONDS,
	McpConcurrencyLimiter,
	RequestRateLimiter,
	SlidingWindowRateLimiter,
} from './index.js';

const categories: RateLimitConfiguration['categories'] = {
	oauth_authorize: { maximumRequests: 1, windowSeconds: 60 },
	oauth_register: { maximumRequests: 1, windowSeconds: 60 },
	oauth_token_network: { maximumRequests: 1, windowSeconds: 60 },
	oauth_token_client: { maximumRequests: 1, windowSeconds: 60 },
	oauth_revoke: { maximumRequests: 1, windowSeconds: 60 },
	mcp_network: { maximumRequests: 1, windowSeconds: 60 },
	mcp_user: { maximumRequests: 1, windowSeconds: 60 },
	failed_authentication: { maximumRequests: 1, windowSeconds: 60 },
};

describe('sliding-window rate limiting', () => {
	it('admits atomically and computes Retry-After from the oldest member', async () => {
		let nowMilliseconds = 1_000;
		const limiter = new SlidingWindowRateLimiter(() => nowMilliseconds);
		const store = createInMemorySlidingWindowStore();
		const input = {
			key: 'rate_limit:test',
			maximumRequests: 1,
			windowSeconds: 10,
			atomicStore: store,
		};
		expect((await limiter.consume(input)).allowed).toBe(true);
		nowMilliseconds = 5_500;
		expect(await limiter.consume(input)).toEqual({
			allowed: false,
			retryAfterSeconds: 6,
			remainingRequests: 0,
		});
	});

	it('keeps the eight protocol categories and key namespace in the shared policy', async () => {
		const limiter = new RequestRateLimiter(
			{ categories, maximumConcurrent: 2, keyNamespace: 'suite' },
			() => createInMemorySlidingWindowStore(),
			() => 1_000,
		);
		for (const category of Object.keys(categories) as Array<keyof typeof categories>) {
			expect((await limiter.consume(category, 'subject')).allowed).toBe(true);
		}
	});

	it('rejects each named non-finite Redis script argument before eval', async () => {
		const client: MinimalRedisClient = {
			eval: async () => {
				throw new Error('eval must not run');
			},
			zRem: async () => 0,
		};
		const store = createRedisSlidingWindowStore(client);
		for (const [parameterName, override] of [
			['nowMilliseconds', { nowMilliseconds: Number.NaN }],
			['windowMilliseconds', { windowMilliseconds: Number.POSITIVE_INFINITY }],
			['maximumRequests', { maximumRequests: Number.NEGATIVE_INFINITY }],
		] as const) {
			await expect(
				store.consume({
					key: 'key',
					nowMilliseconds: 1,
					windowMilliseconds: 2,
					maximumRequests: 3,
					member: 'member',
					...override,
				}),
			).rejects.toThrow(parameterName);
		}
	});

	it('uses only eval and zRem on a hand-written minimal Redis client', async () => {
		const calls: Array<{ script: string; arguments: string[] }> = [];
		const client: MinimalRedisClient = {
			eval: async (script, options) => {
				calls.push({ script, arguments: options.arguments });
				return [1, 0, 0];
			},
			zRem: async () => 1,
		};
		await createRedisSlidingWindowStore(client).consume({
			key: 'key',
			nowMilliseconds: 1,
			windowMilliseconds: 2,
			maximumRequests: 3,
			member: 'member',
		});
		expect(calls[0]?.script).toContain("ZRANGE', key, 0, 0, 'WITHSCORES'");
		expect(calls[0]?.arguments).toEqual(['1', '2', '3', 'member']);
	});
});

describe('concurrency slots', () => {
	it('assigns each Redis slot its own member and releases only that member', async () => {
		const released: string[] = [];
		const acquiredMembers: string[] = [];
		const client: MinimalRedisClient = {
			eval: async (_script, options) => {
				acquiredMembers.push(options.arguments.at(-1) ?? '');
				return 1;
			},
			zRem: async (_key, member) => {
				released.push(member);
				return 1;
			},
		};
		const store = createRedisConcurrencySlotStore(client, {
			createId: (() => {
				let identifier = 0;
				return () => `slot-${++identifier}`;
			})(),
		});
		const first = await store.acquire('key', 2, 100);
		const second = await store.acquire('key', 2, 100);
		expect(acquiredMembers).toEqual(['slot-1', 'slot-2']);
		await store.release('key', first!);
		expect(released).toEqual(['slot-1']);
		expect(second?.id).toBe('slot-2');
	});

	it('does not let stale release corrupt a newer in-memory slot generation', async () => {
		const store = createInMemoryConcurrencySlotStore();
		const stale = await store.acquire('key', 1, 100);
		await store.release('key', stale!);
		const current = await store.acquire('key', 1, 100);
		await store.release('key', stale!);
		expect(await store.acquire('key', 1, 100)).toBeNull();
		await store.release('key', current!);
		expect(await store.acquire('key', 1, 100)).not.toBeNull();
	});

	it('releases in catch paths and renews more frequently than the slot TTL', async () => {
		expect(DEFAULT_CONCURRENCY_SLOT_RENEWAL_INTERVAL_MILLISECONDS).toBeLessThan(
			DEFAULT_CONCURRENCY_SLOT_TTL_MILLISECONDS,
		);
		let released = 0;
		const store: ConcurrencySlotStore = {
			acquire: async () => ({ id: 'slot' }),
			renew: async () => true,
			release: async () => {
				released++;
			},
		};
		const slot = await new McpConcurrencyLimiter(store, 1, 30).acquire('key');
		expect(slot.renewalIntervalMilliseconds).toBe(10);
		expect(slot.renewalIntervalMilliseconds).toBeLessThan(30);
		try {
			throw new Error('handler failed');
		} catch {
			await slot.release();
		}
		expect(released).toBe(1);
	});

	it('holds a slot until the response body closes', async () => {
		let releaseCount = 0;
		let close!: () => void;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				close = () => controller.close();
			},
		});
		const response = attachConcurrencySlotToResponseLifetime(new Response(body), {
			allowed: true,
			release: async () => {
				releaseCount++;
			},
			renew: async () => {},
		});
		expect(releaseCount).toBe(0);
		close();
		await response.body!.getReader().read();
		await Promise.resolve();
		expect(releaseCount).toBe(1);
	});

	describe('response body cancellation', () => {
		type Deferred = {
			promise: Promise<void>;
			resolve: () => void;
			reject: (error: unknown) => void;
		};
		const deferred = (): Deferred => {
			let resolve!: () => void;
			let reject!: (error: unknown) => void;
			const promise = new Promise<void>((promiseResolve, promiseReject) => {
				resolve = promiseResolve;
				reject = promiseReject;
			});
			return { promise, resolve, reject };
		};
		const track = (promise: Promise<unknown>) => {
			const state: { settled: boolean; error?: unknown; rejected: boolean } = {
				settled: false,
				rejected: false,
			};
			void promise.then(
				() => {
					state.settled = true;
				},
				(error) => {
					state.settled = true;
					state.rejected = true;
					state.error = error;
				},
			);
			return state;
		};
		const flush = async () => {
			for (let index = 0; index < 10; index++) await Promise.resolve();
		};
		const createHarness = (sourceCancellation: Deferred, releaseSettlement: Deferred) => {
			const calls = { sourceCancel: 0, release: 0 };
			const body = new ReadableStream<Uint8Array>({
				cancel() {
					calls.sourceCancel++;
					return sourceCancellation.promise;
				},
			});
			const response = attachConcurrencySlotToResponseLifetime(new Response(body), {
				allowed: true,
				release: () => {
					calls.release++;
					return releaseSettlement.promise;
				},
				renew: async () => {},
			});
			return { calls, response };
		};

		it('does not resolve until slot release settles', async () => {
			const source = deferred();
			const release = deferred();
			const { calls, response } = createHarness(source, release);
			const cancellation = track(response.body!.cancel());
			source.resolve();
			await flush();
			expect(calls).toEqual({ sourceCancel: 1, release: 1 });
			expect(cancellation.settled).toBe(false);
			release.resolve();
			await flush();
			expect(cancellation.settled).toBe(true);
			expect(cancellation.rejected).toBe(false);
		});

		it('does not resolve until source cancellation settles', async () => {
			const source = deferred();
			const release = deferred();
			const { calls, response } = createHarness(source, release);
			const cancellation = track(response.body!.cancel());
			release.resolve();
			await flush();
			expect(calls).toEqual({ sourceCancel: 1, release: 1 });
			expect(cancellation.settled).toBe(false);
			source.resolve();
			await flush();
			expect(cancellation.settled).toBe(true);
			expect(cancellation.rejected).toBe(false);
		});

		it('contains a source cancellation failure when release succeeds', async () => {
			const source = deferred();
			const release = deferred();
			const { calls, response } = createHarness(source, release);
			const cancellation = track(response.body!.cancel());
			source.reject(new Error('source failed'));
			release.resolve();
			await flush();
			expect(calls).toEqual({ sourceCancel: 1, release: 1 });
			expect(cancellation.settled).toBe(true);
			expect(cancellation.rejected).toBe(false);
		});

		it('rejects with the release error after source cancellation settles', async () => {
			const source = deferred();
			const release = deferred();
			const { response } = createHarness(source, release);
			const cancellation = track(response.body!.cancel());
			const releaseError = new Error('release failed');
			release.reject(releaseError);
			await flush();
			expect(cancellation.settled).toBe(false);
			source.resolve();
			await flush();
			expect(cancellation.settled).toBe(true);
			expect(cancellation.error).toBe(releaseError);
		});

		it('prefers the release error when both operations reject', async () => {
			const source = deferred();
			const release = deferred();
			const { calls, response } = createHarness(source, release);
			const cancellation = track(response.body!.cancel());
			const releaseError = new Error('release failed');
			source.reject(new Error('source failed'));
			release.reject(releaseError);
			await flush();
			expect(calls).toEqual({ sourceCancel: 1, release: 1 });
			expect(cancellation.error).toBe(releaseError);
		});

		it('releases exactly once and stops renewal when completion races cancellation', async () => {
			let releaseCount = 0;
			const intervals: unknown[] = [];
			const cleared: unknown[] = [];
			const originalSetInterval = globalThis.setInterval;
			const originalClearInterval = globalThis.clearInterval;
			globalThis.setInterval = ((...parameters: Parameters<typeof setInterval>) => {
				const handle = originalSetInterval(...parameters);
				intervals.push(handle);
				return handle;
			}) as typeof setInterval;
			globalThis.clearInterval = ((handle?: Parameters<typeof clearInterval>[0]) => {
				cleared.push(handle);
				originalClearInterval(handle);
			}) as typeof clearInterval;
			try {
				let close!: () => void;
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						close = () => controller.close();
					},
				});
				const response = attachConcurrencySlotToResponseLifetime(new Response(body), {
					allowed: true,
					release: async () => {
						releaseCount++;
					},
					renew: async () => {},
				});
				expect(intervals).toHaveLength(1);
				const reader = response.body!.getReader();
				const read = reader.read();
				close();
				await read;
				await reader.cancel();
				await flush();
			} finally {
				globalThis.setInterval = originalSetInterval;
				globalThis.clearInterval = originalClearInterval;
			}
			expect(releaseCount).toBe(1);
			expect(cleared).toEqual(intervals);
		});

		it('keeps platform behaviour for repeated public cancel calls', async () => {
			let releaseCount = 0;
			const body = new ReadableStream<Uint8Array>();
			const response = attachConcurrencySlotToResponseLifetime(new Response(body), {
				allowed: true,
				release: async () => {
					releaseCount++;
				},
				renew: async () => {},
			});
			await response.body!.cancel();
			await response.body!.cancel();
			expect(releaseCount).toBe(1);
		});

		it('releases when the source read fails', async () => {
			let releaseCount = 0;
			const body = new ReadableStream<Uint8Array>({
				pull() {
					throw new Error('read failed');
				},
			});
			const response = attachConcurrencySlotToResponseLifetime(new Response(body), {
				allowed: true,
				release: async () => {
					releaseCount++;
				},
				renew: async () => {},
			});
			await expect(response.body!.getReader().read()).rejects.toThrow('read failed');
			await flush();
			expect(releaseCount).toBe(1);
		});

		it('releases immediately for responses without a usable body', async () => {
			let releaseCount = 0;
			const slot = {
				allowed: true,
				release: async () => {
					releaseCount++;
				},
				renew: async () => {},
			};
			const empty = new Response(null);
			expect(attachConcurrencySlotToResponseLifetime(empty, slot)).toBe(empty);
			const used = new Response('body');
			await used.text();
			expect(attachConcurrencySlotToResponseLifetime(used, slot)).toBe(used);
			expect(releaseCount).toBe(2);
		});
	});
});

describe('rate-limit response', () => {
	it('returns the protocol error and Retry-After header', async () => {
		const response = createRateLimitedResponse(7, { 'X-Test': 'yes' });
		expect(response.status).toBe(429);
		expect(response.headers.get('Retry-After')).toBe('7');
		expect(await response.json()).toEqual({
			error: 'rate_limited',
			error_description: 'Too many requests',
		});
	});
});
