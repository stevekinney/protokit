import { afterAll, describe, expect, it, mock } from 'bun:test';

/**
 * Exercises `redis-client.ts`'s success paths against Docker Compose's real
 * local test Redis, since an in-memory stub would prove nothing about the
 * real `connect()`/`duplicate()`/`quit()` sequence this module owns. The
 * "not configured" and "unreachable" branches live in
 * `redis-client-unconfigured.test.ts` and `redis-client-unreachable.test.ts`
 * respectively -- each needs a fresh, uncached module instance (this
 * module's `getRedisClient`/`getRedisSubscriberClient` are lazy singletons
 * for the life of the process), which `--isolate` gives by running every
 * test file in its own process.
 */
const realRedisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

mock.module('@web/env', () => ({
	environment: { REDIS_URL: realRedisUrl },
}));

const {
	isRedisConfigured,
	isRedisHealthy,
	getRedisClient,
	getRedisSubscriberClient,
	disconnectRedisSubscriberClient,
} = await import('@web/lib/redis-client');

afterAll(async () => {
	await disconnectRedisSubscriberClient();
});

describe('redis-client against a real, reachable Redis', () => {
	it('isRedisConfigured reports true', () => {
		expect(isRedisConfigured()).toBe(true);
	});

	it('isRedisHealthy resolves true', async () => {
		expect(await isRedisHealthy()).toBe(true);
	});

	it('getRedisClient connects and returns an open client', async () => {
		const client = await getRedisClient();
		expect(client.isOpen).toBe(true);
	});

	it('getRedisClient returns the same cached client on a second call', async () => {
		const first = await getRedisClient();
		const second = await getRedisClient();
		expect(second).toBe(first);
	});

	it('getRedisSubscriberClient connects a duplicated client', async () => {
		const subscriber = await getRedisSubscriberClient();
		expect(subscriber.isOpen).toBe(true);
	});

	it('logs rather than throws when the subscriber client emits an error event', async () => {
		const subscriber = await getRedisSubscriberClient();
		// The subscriber client's own `error` listener (registered inside
		// `getRedisSubscriberClient`) only logs -- node-redis clients emit
		// `error` on real connection hiccups, which this simulates directly
		// rather than trying to induce a real one against a healthy local
		// Redis.
		expect(() =>
			subscriber.emit('error', new Error('simulated subscriber socket error')),
		).not.toThrow();
	});

	it('disconnectRedisSubscriberClient closes the open subscriber client', async () => {
		// Ensure a subscriber client exists and is open before disconnecting it.
		const subscriber = await getRedisSubscriberClient();
		expect(subscriber.isOpen).toBe(true);

		await disconnectRedisSubscriberClient();
		expect(subscriber.isOpen).toBe(false);

		// A second call with no open subscriber client is a no-op, not an error.
		expect(await disconnectRedisSubscriberClient()).toBeUndefined();
	});
});
