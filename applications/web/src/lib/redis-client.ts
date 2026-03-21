import { createClient } from 'redis';
import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisClientPromise: Promise<RedisClient> | null = null;

function createRedisClient(): RedisClient {
	const client = createClient({ url: environment.REDIS_URL });

	client.on('error', (error) => {
		logger.error({ err: error }, 'Redis client error');
	});

	return client;
}

export async function getRedisClient(): Promise<RedisClient> {
	if (redisClient?.isOpen) {
		return redisClient;
	}

	if (redisClientPromise) {
		return redisClientPromise;
	}

	redisClientPromise = (async () => {
		if (!redisClient) {
			redisClient = createRedisClient();
		}

		if (!redisClient.isOpen) {
			await redisClient.connect();
		}

		return redisClient;
	})();

	try {
		return await redisClientPromise;
	} finally {
		redisClientPromise = null;
	}
}

let subscriberClient: RedisClient | null = null;
let subscriberClientPromise: Promise<RedisClient> | null = null;

export async function getRedisSubscriberClient(): Promise<RedisClient> {
	if (subscriberClient?.isOpen) {
		return subscriberClient;
	}

	if (subscriberClientPromise) {
		return subscriberClientPromise;
	}

	subscriberClientPromise = (async () => {
		const mainClient = await getRedisClient();
		subscriberClient = mainClient.duplicate();

		subscriberClient.on('error', (error) => {
			logger.error({ err: error }, 'Redis subscriber client error');
		});

		await subscriberClient.connect();
		return subscriberClient;
	})();

	try {
		return await subscriberClientPromise;
	} finally {
		subscriberClientPromise = null;
	}
}

export async function disconnectRedisSubscriberClient(): Promise<void> {
	if (subscriberClient?.isOpen) {
		await subscriberClient.quit();
		subscriberClient = null;
	}
}

export async function isRedisHealthy(): Promise<boolean> {
	try {
		const client = await getRedisClient();
		await client.ping();
		return true;
	} catch {
		return false;
	}
}
