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

/**
 * The most recent subscriber startup, retained so
 * `disconnectRedisSubscriberClient` can wait for an in-flight one.
 *
 * Review finding (P2): `subscriberClient` is only assigned *inside* the
 * initializer below, after `await getRedisClient()` resolves. A disconnect
 * arriving while that await is still pending therefore saw `null`, did
 * nothing, and returned -- and the pending task then went on to duplicate
 * and connect a client nobody was left holding, leaking an open subscriber
 * for the life of the process. `subscribeToGrantRevocations` starts this
 * fire-and-forget at module evaluation, so the window is real and is widest
 * exactly when startup fails fast (a synchronous invariant failure is
 * microseconds behind the module evaluation that began the connect).
 */
let subscriberStartup: Promise<RedisClient> | null = null;

const connectSubscriberClient = createLazyRedisClient(async () => {
	const mainClient = await getRedisClient();
	subscriberClient = mainClient.duplicate();

	subscriberClient.on('error', (error) => {
		logger.error({ err: error }, 'Redis subscriber client error');
	});

	await subscriberClient.connect();
	return subscriberClient;
});

export function getRedisSubscriberClient(): Promise<RedisClient> {
	const startup = connectSubscriberClient();
	subscriberStartup = startup;
	return startup;
}

export async function disconnectRedisSubscriberClient(): Promise<void> {
	if (!isRedisConfigured()) return;

	// Settle any in-flight startup first, so a subscriber that connects
	// moments from now is closed rather than orphaned. A failed startup is
	// swallowed deliberately: there is then nothing to close, and disconnect
	// is not the place to surface a connection error a caller never asked
	// for.
	if (subscriberStartup) {
		await subscriberStartup.catch(() => undefined);
		subscriberStartup = null;
	}

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
