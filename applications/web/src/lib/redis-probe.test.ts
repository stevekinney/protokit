import { describe, expect, it } from 'bun:test';
import { probeRedisUrl, redisProbeTimeoutMs } from '@web/lib/redis-probe';

/**
 * `probeRedisUrl` connects to an arbitrary Redis URL and pings it, bounded
 * end-to-end. Docker Compose's local test stack provides a real reachable
 * Redis (see `REDIS_URL`), so the success path is exercised against it
 * directly rather than mocked — an in-memory stub would prove nothing about
 * the real `connect()`/`ping()`/`disconnect()` sequence this exists to
 * bound.
 */
const realRedisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

describe('probeRedisUrl', () => {
	it('returns true for a real, reachable Redis URL', async () => {
		const result = await probeRedisUrl(realRedisUrl);
		expect(result).toBe(true);
	});

	it('returns false for an unreachable Redis URL rather than throwing', async () => {
		// Port 9 is the Discard Protocol port -- nothing there accepts a Redis
		// handshake, so `connect()` fails without depending on `redisProbeTimeoutMs`
		// actually elapsing.
		const result = await probeRedisUrl('redis://127.0.0.1:9');
		expect(result).toBe(false);
	});

	it('exports its timeout bound as a positive number of milliseconds', () => {
		expect(redisProbeTimeoutMs).toBeGreaterThan(0);
	});
});
