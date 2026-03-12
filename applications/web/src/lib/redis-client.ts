import { createClient } from 'redis';
import { logger } from '@template/mcp/logger';
import { environment } from '../env.js';

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

export async function isRedisHealthy(): Promise<boolean> {
	try {
		const client = await getRedisClient();
		await client.ping();
		return true;
	} catch {
		return false;
	}
}
