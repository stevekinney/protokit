import { createClient } from 'redis';
import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';

type RedisClient = ReturnType<typeof createClient>;

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

export const getRedisClient = createLazyRedisClient(async () => {
	const client = createClient({ url: environment.REDIS_URL });

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
	if (subscriberClient?.isOpen) {
		await subscriberClient.quit();
		subscriberClient = null;
	}
}

export async function isRedisHealthy(): Promise<boolean> {
	const probe = createClient({
		url: environment.REDIS_URL,
		socket: {
			reconnectStrategy: false,
			connectTimeout: 2000,
		},
	});

	try {
		await probe.connect();
		await probe.ping();
		return true;
	} catch {
		return false;
	} finally {
		await probe.disconnect().catch(() => {});
	}
}
