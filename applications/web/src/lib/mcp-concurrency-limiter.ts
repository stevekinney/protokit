import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';
import { isRedisConfigured, getRedisClient } from '@web/lib/redis-client';

const CONCURRENCY_SLOT_TTL_MILLISECONDS = 60_000;

/**
 * Atomically checks the current concurrent-request counter against the cap
 * and, only if under it, increments and refreshes the TTL — one Lua script,
 * so no two concurrent callers can both read "under the cap" and both
 * admit themselves past it.
 */
const acquireScript = `
local key = KEYS[1]
local max_concurrent = tonumber(ARGV[1])
local ttl_ms = tonumber(ARGV[2])

local current = tonumber(redis.call('GET', key) or '0')
if current >= max_concurrent then
  return 0
end

redis.call('INCR', key)
redis.call('PEXPIRE', key, ttl_ms)
return 1
`;

const inMemoryConcurrentCounts = new Map<string, number>();

function acquireInMemorySlot(key: string, maximumConcurrent: number): boolean {
	const current = inMemoryConcurrentCounts.get(key) ?? 0;
	if (current >= maximumConcurrent) return false;
	inMemoryConcurrentCounts.set(key, current + 1);
	return true;
}

function releaseInMemorySlot(key: string): void {
	const current = inMemoryConcurrentCounts.get(key) ?? 0;
	inMemoryConcurrentCounts.set(key, Math.max(0, current - 1));
}

/** Test-only: clears all in-memory concurrency-limiter state between test cases. */
export function resetInMemoryConcurrencyCounts(): void {
	inMemoryConcurrentCounts.clear();
}

export type McpConcurrencySlot = {
	allowed: boolean;
	/** Releases the slot. Safe to call even when `allowed` is false (no-op). */
	release: () => Promise<void>;
};

/**
 * Dependencies `acquireMcpConcurrencySlot` needs beyond the request input.
 * Defaults to the real, module-level `@web/env` / `@web/lib/redis-client`
 * singletons — production call sites never pass this. Tests inject a fake
 * dependency object instead of `mock.module`-ing `@web/env` /
 * `@web/lib/redis-client`, which would otherwise leak globally into every
 * test file that runs afterward in the same process (OPEN-5).
 */
export type McpConcurrencyLimiterDependencies = {
	maximumConcurrent: number;
	isRedisConfigured: () => boolean;
	getRedisClient: () => Promise<Awaited<ReturnType<typeof getRedisClient>>>;
};

const liveMcpConcurrencyLimiterDependencies: McpConcurrencyLimiterDependencies = {
	get maximumConcurrent() {
		return environment.RATE_LIMIT_MCP_CONCURRENT_MAX;
	},
	isRedisConfigured,
	getRedisClient,
};

/**
 * Bounds how many MCP requests one user may have in flight at once —
 * distinct from the time-windowed `enforceMcpRateLimit`, which bounds
 * request *rate* rather than concurrent *load*. Callers must always
 * `release()` the slot, typically in a `finally` block.
 */
export async function acquireMcpConcurrencySlot(
	input: { userId: string },
	dependencies: McpConcurrencyLimiterDependencies = liveMcpConcurrencyLimiterDependencies,
): Promise<McpConcurrencySlot> {
	const key = `rate_limit:mcp_concurrent:${input.userId}`;

	if (!dependencies.isRedisConfigured()) {
		const allowed = acquireInMemorySlot(key, dependencies.maximumConcurrent);
		return {
			allowed,
			release: async () => {
				if (allowed) releaseInMemorySlot(key);
			},
		};
	}

	const redisClient = await dependencies.getRedisClient();
	const reply = (await redisClient.eval(acquireScript, {
		keys: [key],
		arguments: [String(dependencies.maximumConcurrent), String(CONCURRENCY_SLOT_TTL_MILLISECONDS)],
	})) as number;
	const allowed = reply === 1;

	return {
		allowed,
		release: async () => {
			if (!allowed) return;
			try {
				await redisClient.decr(key);
			} catch (error) {
				logger.error({ err: error }, 'Failed to release MCP concurrency slot');
			}
		},
	};
}
