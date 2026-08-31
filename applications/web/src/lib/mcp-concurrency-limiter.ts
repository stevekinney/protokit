import {
	attachConcurrencySlotToResponseLifetime,
	createInMemoryConcurrencySlotStore,
	createRedisConcurrencySlotStore,
	McpConcurrencyLimiter,
	type McpConcurrencySlot,
} from '@lostgradient/mcp/rate-limit';
import { logger } from '@lostgradient/mcp/logger';
import { environment } from '@web/env';
import { getRedisClient, isRedisConfigured } from '@web/lib/redis-client';

export { attachConcurrencySlotToResponseLifetime, type McpConcurrencySlot };

let inMemoryConcurrencySlotStore = createInMemoryConcurrencySlotStore();

export function resetInMemoryConcurrencyCounts(): void {
	inMemoryConcurrencySlotStore = createInMemoryConcurrencySlotStore();
}

export type McpConcurrencyLimiterDependencies = {
	maximumConcurrent: number;
	ttlMilliseconds?: number;
	isRedisConfigured: () => boolean;
	getRedisClient: () => Promise<Awaited<ReturnType<typeof getRedisClient>>>;
};

const liveDependencies: McpConcurrencyLimiterDependencies = {
	get maximumConcurrent() {
		return environment.rateLimitMcpConcurrentMax;
	},
	isRedisConfigured,
	getRedisClient,
};

export async function acquireMcpConcurrencySlot(
	input: { userId: string },
	dependencies: McpConcurrencyLimiterDependencies = liveDependencies,
): Promise<McpConcurrencySlot> {
	const store = dependencies.isRedisConfigured()
		? createRedisConcurrencySlotStore(await dependencies.getRedisClient())
		: inMemoryConcurrencySlotStore;
	const limiter = new McpConcurrencyLimiter(
		store,
		dependencies.maximumConcurrent,
		dependencies.ttlMilliseconds,
		(error, operation) =>
			logger.error({ err: error }, `Failed to ${operation} MCP concurrency slot`),
	);
	return limiter.acquire(`rate_limit:mcp_concurrent:${input.userId}`);
}
