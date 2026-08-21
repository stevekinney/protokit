import { describe, expect, it, beforeEach } from 'bun:test';

import {
	acquireMcpConcurrencySlot,
	resetInMemoryConcurrencyCounts,
	type McpConcurrencyLimiterDependencies,
} from '@web/lib/mcp-concurrency-limiter';

// OPEN-5: this file used to drive `acquireMcpConcurrencySlot` through
// `mock.module('@web/env', ...)` / `mock.module('@web/lib/redis-client', ...)`.
// Bun's `mock.module` is global and is never restored at file boundaries, so
// those mocks leaked into whatever ran after this file in the same test
// process. `acquireMcpConcurrencySlot` now takes an injectable dependencies
// object instead — see `mcp-concurrency-limiter.ts` — so this file passes a
// plain object directly, with nothing global to leak.
const testDependencies: McpConcurrencyLimiterDependencies = {
	maximumConcurrent: 2,
	isRedisConfigured: () => false,
	getRedisClient: async () => {
		throw new Error('should not be called when Redis is not configured');
	},
};

describe('acquireMcpConcurrencySlot', () => {
	beforeEach(() => {
		resetInMemoryConcurrencyCounts();
	});

	it('allows requests up to the configured maximum', async () => {
		const first = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		const second = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		expect(first.allowed).toBe(true);
		expect(second.allowed).toBe(true);
	});

	it('denies a request once the maximum concurrent slots are held', async () => {
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		const third = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		expect(third.allowed).toBe(false);
	});

	it('frees a slot on release, allowing a subsequent request through', async () => {
		const first = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await first.release();

		const third = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		expect(third.allowed).toBe(true);
	});

	it('scopes concurrency slots by user', async () => {
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		const otherUser = await acquireMcpConcurrencySlot({ userId: 'user-2' }, testDependencies);
		expect(otherUser.allowed).toBe(true);
	});

	it('releasing a denied slot is a safe no-op', async () => {
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		const denied = await acquireMcpConcurrencySlot({ userId: 'user-1' }, testDependencies);
		await denied.release();

		const afterNoOpRelease = await acquireMcpConcurrencySlot(
			{ userId: 'user-1' },
			testDependencies,
		);
		expect(afterNoOpRelease.allowed).toBe(false);
	});
});
