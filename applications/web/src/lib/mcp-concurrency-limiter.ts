import { randomUUID } from 'node:crypto';
import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';
import { isRedisConfigured, getRedisClient } from '@web/lib/redis-client';

const CONCURRENCY_SLOT_TTL_MILLISECONDS = 60_000;

/**
 * A review finding (P2): the original implementation was a plain
 * `INCR`/`DECR` counter with one shared `PEXPIRE`. Two problems, both real:
 *
 * 1. A modern `subscriptions/listen` response can legitimately stay open far
 *    longer than 60 seconds (the SDK's own keep-alive interval is 15s, and
 *    nothing bounds how long a client keeps a stream open beyond that). The
 *    key's TTL had no way to know the request was still active, so it
 *    expired out from under a genuinely still-open stream -- after which the
 *    same user could acquire an entirely fresh set of slots on the
 *    now-reset counter, silently defeating the configured cap.
 * 2. `release()` called a bare `DECR`. Once the key above expired and a new
 *    "generation" started counting from a fresh `INCR`, a *later* `release()`
 *    from the OLD (still-open) stream would decrement the NEW generation's
 *    counter instead -- corrupting a completely unrelated set of live slots
 *    it never held.
 *
 * Fixed by giving every acquired slot its own identity (a Redis sorted-set
 * member, scored by its own expiry deadline) rather than sharing one
 * anonymous counter. `release()` removes exactly the member it was given
 * and nothing else -- there is no "generation" for it to collide with.
 * `renew()` lets a caller whose request is still genuinely active push its
 * own member's deadline forward before it lapses, which is the only thing
 * that keeps a long-lived stream's slot counted for as long as the stream
 * is actually open (see `attachConcurrencySlotToResponseLifetime` below,
 * used by `mcp-routes.ts`, which calls `renew()` on an interval for exactly
 * as long as the response's body stream stays open and `release()`s only
 * once that stream actually closes).
 */
const acquireScript = `
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local ttl_ms = tonumber(ARGV[2])
local max_concurrent = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now_ms)
local count = redis.call('ZCARD', key)
if count >= max_concurrent then
  return 0
end

redis.call('ZADD', key, now_ms + ttl_ms, member)
redis.call('PEXPIRE', key, ttl_ms)
return 1
`;

/** Pushes one already-held member's own expiry deadline forward. A no-op (returns 0) if that member's slot already lapsed or was released. */
const renewScript = `
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local ttl_ms = tonumber(ARGV[2])
local member = ARGV[3]

if redis.call('ZSCORE', key, member) == false then
  return 0
end

redis.call('ZADD', key, now_ms + ttl_ms, member)
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
	/** Releases the slot. Safe to call even when `allowed` is false, and safe to call more than once (idempotent). */
	release: () => Promise<void>;
	/**
	 * Pushes this slot's own expiry forward by another full TTL window.
	 * Only meaningful when `allowed` is `true` and backed by Redis (the
	 * in-memory fallback has no expiry to renew); a no-op otherwise. Callers
	 * whose request is still genuinely active must call this on an interval
	 * shorter than the TTL, or a long-lived request's slot can lapse out
	 * from under it -- see the module comment above.
	 */
	renew: () => Promise<void>;
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
	/** Defaults to `CONCURRENCY_SLOT_TTL_MILLISECONDS` (60s). Injectable so a test can exercise real Redis-side expiry/renewal behavior without waiting a real minute. */
	ttlMilliseconds?: number;
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
 * `release()` the slot, typically in a `finally` block, and — for any
 * request whose response may stream for longer than the TTL — must
 * `renew()` it periodically while the request stays active (see
 * `attachConcurrencySlotToResponseLifetime`).
 */
export async function acquireMcpConcurrencySlot(
	input: { userId: string },
	dependencies: McpConcurrencyLimiterDependencies = liveMcpConcurrencyLimiterDependencies,
): Promise<McpConcurrencySlot> {
	const key = `rate_limit:mcp_concurrent:${input.userId}`;

	if (!dependencies.isRedisConfigured()) {
		const allowed = acquireInMemorySlot(key, dependencies.maximumConcurrent);
		let released = false;
		return {
			allowed,
			release: async () => {
				if (allowed && !released) {
					released = true;
					releaseInMemorySlot(key);
				}
			},
			// No TTL in the in-memory fallback -- nothing to renew.
			renew: async () => {},
		};
	}

	const ttlMilliseconds = dependencies.ttlMilliseconds ?? CONCURRENCY_SLOT_TTL_MILLISECONDS;
	const redisClient = await dependencies.getRedisClient();
	const member = randomUUID();
	const reply = (await redisClient.eval(acquireScript, {
		keys: [key],
		arguments: [
			String(Date.now()),
			String(ttlMilliseconds),
			String(dependencies.maximumConcurrent),
			member,
		],
	})) as number;
	const allowed = reply === 1;

	let released = false;
	return {
		allowed,
		release: async () => {
			if (!allowed || released) return;
			released = true;
			try {
				await redisClient.zRem(key, member);
			} catch (error) {
				logger.error({ err: error }, 'Failed to release MCP concurrency slot');
			}
		},
		renew: async () => {
			if (!allowed || released) return;
			try {
				await redisClient.eval(renewScript, {
					keys: [key],
					arguments: [String(Date.now()), String(ttlMilliseconds), member],
				});
			} catch (error) {
				logger.error({ err: error }, 'Failed to renew MCP concurrency slot');
			}
		},
	};
}

const CONCURRENCY_SLOT_RENEWAL_INTERVAL_MILLISECONDS = 20_000;

/**
 * Ties a concurrency slot's lifetime to a `Response`'s actual body stream
 * instead of to the promise that produced the `Response` object. Mirrors
 * `in-flight-request-tracker.ts`'s `trackResponseBody` for the identical
 * underlying reason: for a `subscriptions/listen` response, the handler
 * that constructs the `Response` returns as soon as the SSE stream is
 * *opened*, not when it closes, so releasing on that promise's resolution
 * (the original behavior) freed the slot within milliseconds of a stream
 * that could then legitimately stay open for minutes -- the concurrency cap
 * was never actually enforced against a long-lived stream at all.
 *
 * While the wrapped body stays open, this also calls `slot.renew()` on an
 * interval well inside the slot's TTL, so a stream that outlives the
 * original TTL keeps its own slot counted rather than lapsing (see the
 * module comment on `acquireScript` above for why that matters). The
 * interval is cleared and the slot released exactly once the stream closes,
 * is canceled, or errors — whichever happens first.
 */
export function attachConcurrencySlotToResponseLifetime(
	response: Response,
	slot: McpConcurrencySlot,
): Response {
	if (!response.body || response.bodyUsed) {
		void slot.release();
		return response;
	}

	let settled = false;
	const renewalTimer: ReturnType<typeof setInterval> = setInterval(() => {
		void slot.renew();
	}, CONCURRENCY_SLOT_RENEWAL_INTERVAL_MILLISECONDS);
	renewalTimer.unref?.();
	const settleOnce = (): void => {
		if (settled) return;
		settled = true;
		clearInterval(renewalTimer);
		void slot.release();
	};

	const sourceReader = response.body.getReader();
	const trackedBody = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await sourceReader.read();
				if (done) {
					controller.close();
					settleOnce();
					return;
				}
				controller.enqueue(value);
			} catch (error) {
				controller.error(error);
				settleOnce();
			}
		},
		cancel(reason) {
			sourceReader.cancel(reason).catch(() => {});
			settleOnce();
		},
	});

	return new Response(trackedBody, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}
