import { describe, expect, it } from 'bun:test';
import type { RedisClientType } from 'redis';
import { createRedisSlidingWindowStore } from '@web/lib/redis-sliding-window-store';

/**
 * Regression coverage for the defect where missing rate-limit configuration
 * reached Redis as the literal string `"NaN"`.
 *
 * Redis implements Lua's `tonumber` with `strtod`, which parses `"NaN"` and
 * `"Infinity"` as real float values instead of returning nil. A non-finite
 * window therefore arrived at `ZREMRANGEBYSCORE` as a score, Redis rejected the
 * entire script with `ERR min or max is not a float`, and every rate-limited
 * route answered 500. The store must refuse the value before it is serialized,
 * so the failure names the real cause instead of surfacing as an opaque Redis
 * error at request time.
 */

function createRecordingRedisClient() {
	const calls: Array<{ script: string; arguments: string[] }> = [];

	const client = {
		eval: async (script: string, options: { keys: string[]; arguments: string[] }) => {
			calls.push({ script, arguments: options.arguments });
			return [1, 0, 9];
		},
	} as unknown as RedisClientType;

	return { client, calls };
}

const NON_FINITE_VALUES: Array<[string, number]> = [
	['NaN', Number.NaN],
	['Infinity', Number.POSITIVE_INFINITY],
	['negative Infinity', Number.NEGATIVE_INFINITY],
];

describe('createRedisSlidingWindowStore', () => {
	describe('consume', () => {
		for (const [label, value] of NON_FINITE_VALUES) {
			it(`rejects a ${label} window rather than serializing it into the script`, async () => {
				const { client, calls } = createRecordingRedisClient();
				const store = createRedisSlidingWindowStore(client);

				const attempt = store.consume({
					key: 'rate_limit:oauth_register:198.51.100.7',
					nowMilliseconds: 1_755_730_000_000,
					windowMilliseconds: value,
					maximumRequests: 10,
					member: 'member-1',
				});

				await expect(attempt).rejects.toThrow(/non-finite windowMilliseconds/);
				expect(calls).toHaveLength(0);
			});

			it(`rejects a ${label} maximum rather than serializing it into the script`, async () => {
				const { client, calls } = createRecordingRedisClient();
				const store = createRedisSlidingWindowStore(client);

				const attempt = store.consume({
					key: 'rate_limit:oauth_register:198.51.100.7',
					nowMilliseconds: 1_755_730_000_000,
					windowMilliseconds: 60_000,
					maximumRequests: value,
					member: 'member-1',
				});

				await expect(attempt).rejects.toThrow(/non-finite maximumRequests/);
				expect(calls).toHaveLength(0);
			});
		}

		it('names the configuration as the cause rather than blaming Redis', async () => {
			const { client } = createRecordingRedisClient();
			const store = createRedisSlidingWindowStore(client);

			const attempt = store.consume({
				key: 'rate_limit:oauth_register:198.51.100.7',
				nowMilliseconds: 1_755_730_000_000,
				windowMilliseconds: Number.NaN,
				maximumRequests: 10,
				member: 'member-1',
			});

			await expect(attempt).rejects.toThrow(/rate-limit configuration, not a Redis fault/);
		});

		it('serializes finite arguments unchanged', async () => {
			const { client, calls } = createRecordingRedisClient();
			const store = createRedisSlidingWindowStore(client);

			await store.consume({
				key: 'rate_limit:oauth_register:198.51.100.7',
				nowMilliseconds: 1_755_730_000_000,
				windowMilliseconds: 60_000,
				maximumRequests: 10,
				member: 'member-1',
			});

			expect(calls).toHaveLength(1);
			expect(calls[0]?.arguments).toEqual(['1755730000000', '60000', '10', 'member-1']);
		});
	});

	describe('peek', () => {
		it('rejects a non-finite window rather than serializing it into the script', async () => {
			const { client, calls } = createRecordingRedisClient();
			const store = createRedisSlidingWindowStore(client);

			const attempt = store.peek({
				key: 'rate_limit:oauth_register:198.51.100.7',
				nowMilliseconds: 1_755_730_000_000,
				windowMilliseconds: Number.NaN,
			});

			await expect(attempt).rejects.toThrow(/non-finite windowMilliseconds/);
			expect(calls).toHaveLength(0);
		});
	});
});
