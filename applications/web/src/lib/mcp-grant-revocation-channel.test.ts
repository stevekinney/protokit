import { describe, expect, it, mock } from 'bun:test';

/**
 * Unit-level companion to `mcp-grant-revocation-channel.integration.test.ts`
 * (which exercises the real cross-instance Redis pub/sub path). This file
 * mocks `@web/lib/redis-client` (the established pattern also used by
 * `extension-advertisement.test.ts` and `pre-session-routing.test.ts`) to
 * reach the branches the integration test can't drive deterministically:
 * Redis not configured, `getRedisClient`/`getRedisSubscriberClient`
 * rejecting, and a local closer that itself throws. Runs in its own file
 * under `--isolate` so the module-level mock can't leak into the
 * integration test's real-Redis assertions.
 */
let redisConfigured = false;
let publishImplementation: (channel: string, message: string) => Promise<unknown> = async () => 0;
let subscriberClientFactory: () => Promise<{
	subscribe: (channel: string, listener: (message: string) => void) => Promise<void>;
}> = async () => ({ subscribe: async () => {} });

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => redisConfigured,
	isRedisHealthy: async () => redisConfigured,
	getRedisClient: async () => ({
		publish: publishImplementation,
	}),
	getRedisSubscriberClient: () => subscriberClientFactory(),
	disconnectRedisSubscriberClient: async () => {},
}));

const { publishGrantRevocation, subscribeToGrantRevocations, grantRevocationTestHooks } =
	await import('@web/lib/mcp-grant-revocation-channel');

describe('publishGrantRevocation without Redis configured', () => {
	it('invokes local closers directly instead of publishing', async () => {
		redisConfigured = false;
		grantRevocationTestHooks.reset();
		const closed: string[] = [];
		const unregister = grantRevocationTestHooks.registerLocalCloser((userId) => {
			closed.push(userId);
		});

		await publishGrantRevocation('local-only-user');

		expect(closed).toEqual(['local-only-user']);
		unregister();
		grantRevocationTestHooks.reset();
	});

	it('logs but does not throw when a local closer itself rejects', async () => {
		redisConfigured = false;
		grantRevocationTestHooks.reset();
		const unregister = grantRevocationTestHooks.registerLocalCloser(() => {
			return Promise.reject(new Error('closer boom'));
		});

		expect(await publishGrantRevocation('failing-closer-user')).toBeUndefined();
		// `runLocalClosers` fires the closer's rejection handling without
		// awaiting it, so give the microtask queue a turn to run the `.catch`
		// branch before asserting/tearing down.
		await new Promise((resolve) => setTimeout(resolve, 10));

		unregister();
		grantRevocationTestHooks.reset();
	});
});

describe('publishGrantRevocation with Redis configured', () => {
	it('falls back to local closers when publish rejects', async () => {
		redisConfigured = true;
		publishImplementation = async () => {
			throw new Error('publish boom');
		};
		grantRevocationTestHooks.reset();
		const closed: string[] = [];
		const unregister = grantRevocationTestHooks.registerLocalCloser((userId) => {
			closed.push(userId);
		});

		await publishGrantRevocation('fallback-user');

		expect(closed).toEqual(['fallback-user']);
		unregister();
		grantRevocationTestHooks.reset();
		redisConfigured = false;
	});
});

describe('subscribeToGrantRevocations', () => {
	it('logs and does not throw when the subscriber client rejects', async () => {
		redisConfigured = true;
		subscriberClientFactory = async () => {
			throw new Error('subscriber connection boom');
		};
		grantRevocationTestHooks.reset();

		expect(() => subscribeToGrantRevocations(() => {})).not.toThrow();
		// The rejection happens on a microtask inside the module; give it a
		// tick to settle so the catch branch actually executes before this
		// test (and the module's `redisSubscriptionStarted` flag) moves on.
		await new Promise((resolve) => setTimeout(resolve, 10));

		grantRevocationTestHooks.reset();
		redisConfigured = false;
	});
});

describe('grantRevocationTestHooks.registerLocalCloser', () => {
	it('returns an unregister function that removes the closer', async () => {
		redisConfigured = false;
		grantRevocationTestHooks.reset();
		const closed: string[] = [];
		const unregister = grantRevocationTestHooks.registerLocalCloser((userId) => {
			closed.push(userId);
		});

		await publishGrantRevocation('first');
		unregister();
		await publishGrantRevocation('second');

		expect(closed).toEqual(['first']);
		grantRevocationTestHooks.reset();
	});
});
