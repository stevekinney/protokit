import { createClient, type RedisClientType } from 'redis';
import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';
import { probeRedisUrl } from '@web/lib/redis-probe';

type RedisClient = RedisClientType;

export function isRedisConfigured(): boolean {
	return environment.REDIS_URL !== undefined;
}

function createLazyRedisClient(initialize: () => Promise<RedisClient>): () => Promise<RedisClient> {
	let client: RedisClient | null = null;
	let pending: Promise<RedisClient> | null = null;

	return async () => {
		if (client?.isOpen) {
			return client;
		}

		if (pending) {
			return pending;
		}

		pending = (async () => {
			client = await initialize();
			return client;
		})();

		try {
			return await pending;
		} finally {
			pending = null;
		}
	};
}

const MAX_INITIAL_CONNECTION_ATTEMPTS = 3;

export const getRedisClient = createLazyRedisClient(async () => {
	if (!isRedisConfigured()) {
		throw new Error('Redis is not configured. Set REDIS_URL to enable Redis-backed features.');
	}

	const client = createClient({
		url: environment.REDIS_URL,
		socket: {
			connectTimeout: 3000,
			// node-redis's default reconnect strategy retries forever with no
			// upper bound, which means `client.connect()` below would never
			// reject while Redis stays unreachable — every caller (including
			// the rate limiter on the hot request path) would hang
			// indefinitely instead of failing fast. Give up after a few
			// attempts so `connect()` rejects and callers get a real error;
			// the lazy client recreates itself (and retries) on the next call.
			reconnectStrategy: (retries) =>
				retries >= MAX_INITIAL_CONNECTION_ATTEMPTS
					? new Error('Unable to connect to Redis after repeated attempts')
					: Math.min(retries * 100, 1000),
		},
	});

	client.on('error', (error) => {
		logger.error({ err: error }, 'Redis client error');
	});

	await client.connect();
	return client;
});

let subscriberClient: RedisClient | null = null;

export const getRedisSubscriberClient = createLazyRedisClient(async () => {
	const mainClient = await getRedisClient();
	subscriberClient = mainClient.duplicate();

	subscriberClient.on('error', (error) => {
		logger.error({ err: error }, 'Redis subscriber client error');
	});

	await subscriberClient.connect();
	return subscriberClient;
});

export async function disconnectRedisSubscriberClient(): Promise<void> {
	if (!isRedisConfigured()) return;

	if (subscriberClient?.isOpen) {
		await subscriberClient.quit();
		subscriberClient = null;
	}
}

// The bounded connect+ping probe itself lives in `redis-probe.ts` (round-6 review) so
// `scripts/doctor.ts` can share it against a candidate `REDIS_URL` without importing this
// module's top-level `@web/env` read, which throws on an incomplete environment. Round-3 review
// (OPS-002): an unbounded `ping()` after `connect()` succeeds is exactly what let a stuck probe
// stay in `createCoalescedProbe`'s `inFlight` slot forever, since the coalescer only clears that
// slot when the probe promise settles — see `redis-probe.ts` for the deadline itself.
export async function isRedisHealthy(): Promise<boolean> {
	const redisUrl = environment.REDIS_URL;
	if (redisUrl === undefined) return false;
	return probeRedisUrl(redisUrl);
}
