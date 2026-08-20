import { describe, expect, it, mock } from 'bun:test';

const mockEnvironment: Record<string, unknown> = { NODE_ENV: 'development' };
let redisConfigured = false;

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => redisConfigured,
}));

const { assertProductionStartupInvariants } = await import('@web/lib/startup-invariants');

describe('assertProductionStartupInvariants', () => {
	it('does nothing outside production, even without Redis configured', () => {
		mockEnvironment.NODE_ENV = 'development';
		redisConfigured = false;
		expect(() => assertProductionStartupInvariants()).not.toThrow();
	});

	it('does nothing in test, even without Redis configured', () => {
		mockEnvironment.NODE_ENV = 'test';
		redisConfigured = false;
		expect(() => assertProductionStartupInvariants()).not.toThrow();
	});

	it('throws in production when Redis is not configured', () => {
		mockEnvironment.NODE_ENV = 'production';
		redisConfigured = false;
		expect(() => assertProductionStartupInvariants()).toThrow(/REDIS_URL/);
	});

	it('does not throw in production when Redis is configured', () => {
		mockEnvironment.NODE_ENV = 'production';
		redisConfigured = true;
		expect(() => assertProductionStartupInvariants()).not.toThrow();
	});
});
