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
 * Bounds how many MCP requests one user may have in flight at once —
 * distinct from the time-windowed `enforceMcpRateLimit`, which bounds
 * request *rate* rather than concurrent *load*. Callers must always
 * `release()` the slot, typically in a `finally` block.
 */
export async function acquireMcpConcurrencySlot(input: {
	userId: string;
}): Promise<McpConcurrencySlot> {
	const key = `rate_limit:mcp_concurrent:${input.userId}`;

	if (!isRedisConfigured()) {
		const allowed = acquireInMemorySlot(key, environment.RATE_LIMIT_MCP_CONCURRENT_MAX);
		return {
			allowed,
			release: async () => {
				if (allowed) releaseInMemorySlot(key);
			},
		};
	}

	const redisClient = await getRedisClient();
	const reply = (await redisClient.eval(acquireScript, {
		keys: [key],
		arguments: [
			String(environment.RATE_LIMIT_MCP_CONCURRENT_MAX),
			String(CONCURRENCY_SLOT_TTL_MILLISECONDS),
		],
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
