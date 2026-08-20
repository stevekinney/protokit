import { describe, expect, it, beforeEach, mock } from 'bun:test';

mock.module('@web/env', () => ({
	environment: { RATE_LIMIT_MCP_CONCURRENT_MAX: 2 },
}));

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => false,
	getRedisClient: async () => {
		throw new Error('should not be called when Redis is not configured');
	},
}));

const { acquireMcpConcurrencySlot, resetInMemoryConcurrencyCounts } =
	await import('@web/lib/mcp-concurrency-limiter');

describe('acquireMcpConcurrencySlot', () => {
	beforeEach(() => {
		resetInMemoryConcurrencyCounts();
	});

	it('allows requests up to the configured maximum', async () => {
		const first = await acquireMcpConcurrencySlot({ userId: 'user-1' });
		const second = await acquireMcpConcurrencySlot({ userId: 'user-1' });
		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
	});

	it('denies a request once the maximum concurrent slots are held', async () => {
		await acquireMcpConcurrencySlot({ userId: 'user-1' });
		await acquireMcpConcurrencySlot({ userId: 'user-1' });
		const third = await acquireMcpConcurrencySlot({ userId: 'user-1' });
		expect(third.allowed).toBe(false);
	});

	it('frees a slot on release, allowing a subsequent request through', async () => {
		const first = await acquireMcpConcurrencySlot({ userId: 'user-1' });
		await acquireMcpConcurrencySlot({ userId: 'user-1' });
		await first.release();

		const third = await acquireMcpConcurrencySlot({ userId: 'user-1' });
		expect(third.allowed).toBe(true);
	});

	it('scopes concurrency slots by user', async () => {
		await acquireMcpConcurrencySlot({ userId: 'user-1' });
		await acquireMcpConcurrencySlot({ userId: 'user-1' });
		const otherUser = await acquireMcpConcurrencySlot({ userId: 'user-2' });
		expect(otherUser.allowed).toBe(true);
	});

	it('releasing a denied slot is a safe no-op', async () => {
		await acquireMcpConcurrencySlot({ userId: 'user-1' });
		await acquireMcpConcurrencySlot({ userId: 'user-1' });
		const denied = await acquireMcpConcurrencySlot({ userId: 'user-1' });
		await denied.release();

		const afterNoOpRelease = await acquireMcpConcurrencySlot({ userId: 'user-1' });
		expect(afterNoOpRelease.allowed).toBe(false);
	});
});
