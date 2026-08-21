import { describe, expect, it, mock } from 'bun:test';

const mockEnvironment: Record<string, unknown> = { NODE_ENV: 'development' };
const mockDatabaseEnvironment: Record<string, unknown> = {
	DATABASE_URL:
		'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=require',
	DATABASE_URL_UNPOOLED: undefined,
	DATABASE_LOCAL_PROXY_URL: undefined,
};
let redisConfigured = false;

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@template/database/env', () => ({
	environment: mockDatabaseEnvironment,
}));

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => redisConfigured,
}));

const { assertProductionStartupInvariants } = await import('@web/lib/startup-invariants');

/** A fully valid production configuration. Tests mutate one field away from this. */
function resetToValidProductionConfiguration(): void {
	mockEnvironment.NODE_ENV = 'production';
	mockEnvironment.BASE_URL = 'https://app.example.com';
	mockEnvironment.REDIS_URL = 'rediss://production-redis.example.com:6380';
	mockEnvironment.GOOGLE_CLIENT_ID = 'client-id';
	mockEnvironment.GOOGLE_CLIENT_SECRET = 'client-secret';
	redisConfigured = true;
	mockDatabaseEnvironment.DATABASE_URL =
		'postgresql://produser:realsecret@production-host.example.com:5432/app?sslmode=require';
	mockDatabaseEnvironment.DATABASE_URL_UNPOOLED = undefined;
	mockDatabaseEnvironment.DATABASE_LOCAL_PROXY_URL = undefined;
}

describe('assertProductionStartupInvariants', () => {
	it('does nothing outside production, even with a fully invalid configuration', () => {
		mockEnvironment.NODE_ENV = 'development';
		mockEnvironment.BASE_URL = undefined;
		redisConfigured = false;
		expect(() => assertProductionStartupInvariants()).not.toThrow();
	});

	it('does nothing in test, even with a fully invalid configuration', () => {
		mockEnvironment.NODE_ENV = 'test';
		mockEnvironment.BASE_URL = undefined;
		redisConfigured = false;
		expect(() => assertProductionStartupInvariants()).not.toThrow();
	});

	it('does not throw in production when every setting is valid', () => {
		resetToValidProductionConfiguration();
		expect(() => assertProductionStartupInvariants()).not.toThrow();
	});

	it('throws in production when Redis is not configured', () => {
		resetToValidProductionConfiguration();
		redisConfigured = false;
		expect(() => assertProductionStartupInvariants()).toThrow(/REDIS_URL is not set/);
	});

	it('throws in production when REDIS_URL is not the encrypted rediss:// scheme', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.REDIS_URL = 'redis://production-redis.example.com:6379';
		expect(() => assertProductionStartupInvariants()).toThrow(/rediss:\/\//);
	});

	it('throws in production when REDIS_URL points at a loopback host', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.REDIS_URL = 'rediss://localhost:6380';
		expect(() => assertProductionStartupInvariants()).toThrow(/local host/);
	});

	it('throws in production when REDIS_URL uses placeholder credentials', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.REDIS_URL = 'rediss://test:test@production-redis.example.com:6380';
		expect(() => assertProductionStartupInvariants()).toThrow(/placeholder credentials/);
	});

	it('throws in production when BASE_URL is not set', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.BASE_URL = undefined;
		expect(() => assertProductionStartupInvariants()).toThrow(/BASE_URL is not set/);
	});

	it('throws in production when BASE_URL is not https', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.BASE_URL = 'http://app.example.com';
		expect(() => assertProductionStartupInvariants()).toThrow(/must use https/);
	});

	it('throws in production when DATABASE_URL has no encrypted, verified transport', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_URL =
			'postgresql://produser:realsecret@production-host.example.com:5432/app';
		expect(() => assertProductionStartupInvariants()).toThrow(/encrypted, certificate-verified/);
	});

	it('throws in production when DATABASE_URL points at a local host', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_URL =
			'postgresql://produser:realsecret@localhost:5432/app?sslmode=require';
		expect(() => assertProductionStartupInvariants()).toThrow(/local host/);
	});

	it('throws in production when DATABASE_URL uses placeholder credentials', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_URL =
			'postgresql://user:password@production-host.example.com:5432/app?sslmode=require';
		expect(() => assertProductionStartupInvariants()).toThrow(/placeholder credentials/);
	});

	it('throws in production when DATABASE_LOCAL_PROXY_URL is set', () => {
		resetToValidProductionConfiguration();
		mockDatabaseEnvironment.DATABASE_LOCAL_PROXY_URL = 'http://db.localtest.me:4444/sql';
		expect(() => assertProductionStartupInvariants()).toThrow(/DATABASE_LOCAL_PROXY_URL is set/);
	});

	it('throws in production when Google credentials are partially configured', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.GOOGLE_CLIENT_SECRET = undefined;
		expect(() => assertProductionStartupInvariants()).toThrow(/must both be set or both be absent/);
	});

	it('does not throw in production when Google credentials are both absent', () => {
		resetToValidProductionConfiguration();
		mockEnvironment.GOOGLE_CLIENT_ID = undefined;
		mockEnvironment.GOOGLE_CLIENT_SECRET = undefined;
		expect(() => assertProductionStartupInvariants()).not.toThrow();
	});

	it('reports every failing setting in one error, not just the first', () => {
		resetToValidProductionConfiguration();
		redisConfigured = false;
		mockEnvironment.BASE_URL = undefined;
		try {
			assertProductionStartupInvariants();
			throw new Error('expected assertProductionStartupInvariants to throw');
		} catch (error) {
			const message = (error as Error).message;
			expect(message).toContain('REDIS_URL is not set');
			expect(message).toContain('BASE_URL is not set');
		}
	});
});
