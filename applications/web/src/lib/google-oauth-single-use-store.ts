import { getRedisClient, isRedisConfigured } from '@web/lib/redis-client';

/**
 * FEDAUTH-001 / S-16: makes a one-time value (a Google OAuth `state`)
 * actually one-time. A signed, expiring cookie alone only proves the value
 * was issued by this server and has not expired — it does not stop the same
 * callback URL and cookie from being replayed twice within the TTL. This
 * store adds the missing "already consumed" check via an atomic
 * check-and-set, so a second claim of the same key always fails regardless
 * of how close in time it races the first.
 *
 * Same dependency-injection / in-memory-fallback shape as
 * `mcp-concurrency-limiter.ts`: Redis is required in production
 * (`CONFIG-001`), but development and most tests run without it, so a
 * process-local fallback keeps the single-use guarantee (within one
 * process) rather than silently becoming a no-op.
 */

const inMemoryClaimedKeys = new Map<string, number>();

function pruneExpiredInMemoryClaims(now: number): void {
	for (const [key, expiresAt] of inMemoryClaimedKeys) {
		if (expiresAt <= now) inMemoryClaimedKeys.delete(key);
	}
}

export type GoogleOauthSingleUseStoreDependencies = {
	isRedisConfigured: () => boolean;
	getRedisClient: () => Promise<Awaited<ReturnType<typeof getRedisClient>>>;
	now: () => number;
};

const liveGoogleOauthSingleUseStoreDependencies: GoogleOauthSingleUseStoreDependencies = {
	isRedisConfigured,
	getRedisClient,
	now: () => Date.now(),
};

/**
 * Atomically claims `key` for `ttlMilliseconds`. Returns `true` the first
 * time a given key is claimed, `false` on every later attempt while the
 * claim is still live (a replay). A claim that outlives its TTL can in
 * principle be reused, but the TTL here is always set to the same lifetime
 * as the signed cookie the key is derived from, so the cookie itself is
 * already rejected as expired by the time the claim would expire.
 */
export async function claimSingleUse(
	key: string,
	ttlMilliseconds: number,
	dependencies: GoogleOauthSingleUseStoreDependencies = liveGoogleOauthSingleUseStoreDependencies,
): Promise<boolean> {
	if (!dependencies.isRedisConfigured()) {
		const now = dependencies.now();
		pruneExpiredInMemoryClaims(now);
		if (inMemoryClaimedKeys.has(key)) return false;
		inMemoryClaimedKeys.set(key, now + ttlMilliseconds);
		return true;
	}

	const redisClient = await dependencies.getRedisClient();
	const result = await redisClient.set(key, '1', {
		condition: 'NX',
		expiration: { type: 'PX', value: ttlMilliseconds },
	});
	return result === 'OK';
}

/** Test-only: clears in-memory claim state so tests don't leak state across files/cases. */
export function resetGoogleOauthSingleUseStoreForTests(): void {
	inMemoryClaimedKeys.clear();
}
