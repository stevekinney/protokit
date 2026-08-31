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
