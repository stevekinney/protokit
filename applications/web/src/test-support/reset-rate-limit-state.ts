/**
 * Clears every `rate_limit:*` key from Redis.
 *
 * `SEC-003`'s rate limiting is keyed by network identity, which is the loopback
 * address for every integration test, and that state lives in Redis — so it
 * survives both the boundary between test files and the boundary between whole
 * process runs. Without an explicit reset, one file's requests spend another
 * file's budget, and a test that expects success intermittently gets a stale
 * 429 instead. That defect was fixed once as `OPEN-3` and then reappeared in
 * `FEDAUTH-001`'s new Google sign-in suite, which exhausted
 * `RATE_LIMIT_GOOGLE_AUTH_MAX` through no fault of its own.
 *
 * Call this once at module scope in any test file whose Redis-backed cases make
 * rate-limited requests, before the suites run. It is a no-op when Redis is not
 * configured, so a caller does not need to guard it.
 *
 * Resetting the shared counter is the correct fix here; raising the limit for
 * tests would hide the coupling rather than remove it, and would stop the tests
 * exercising the production limits at all.
 */
export async function resetRateLimitState(): Promise<void> {
	const { isRedisConfigured, getRedisClient } = await import('@web/lib/redis-client');

	if (!isRedisConfigured()) return;

	const redisClient = await getRedisClient();
	const staleRateLimitKeys = await redisClient.keys('rate_limit:*');

	if (staleRateLimitKeys.length > 0) {
		await redisClient.del(staleRateLimitKeys);
	}
}
