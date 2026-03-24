import { describe, expect, it, mock, beforeEach } from 'bun:test';

const sortedSets = new Map<string, Map<string, number>>();

mock.module('@web/env', () => ({
	environment: {
		RATE_LIMIT_REGISTER_MAX: 3,
		RATE_LIMIT_REGISTER_WINDOW_SECONDS: 60,
		RATE_LIMIT_TOKEN_MAX: 5,
		RATE_LIMIT_TOKEN_WINDOW_SECONDS: 60,
		RATE_LIMIT_MCP_MAX: 10,
		RATE_LIMIT_MCP_WINDOW_SECONDS: 60,
	},
}));

mock.module('@web/lib/redis-client', () => ({
	getRedisClient: async () => ({
		zRemRangeByScore: async (key: string, min: number, max: number) => {
			const set = sortedSets.get(key);
			if (!set) return;
			for (const [member, score] of set) {
				if (score >= min && score <= max) set.delete(member);
			}
		},
		zCard: async (key: string) => sortedSets.get(key)?.size ?? 0,
		zAdd: async (key: string, entries: { score: number; value: string }[]) => {
			if (!sortedSets.has(key)) sortedSets.set(key, new Map());
			const set = sortedSets.get(key)!;
			for (const entry of entries) {
				set.set(entry.value, entry.score);
			}
		},
		zRangeWithScores: async (key: string, start: number) => {
			const set = sortedSets.get(key);
			if (!set || set.size === 0) return [];
			const entries = [...set.entries()]
				.map(([value, score]) => ({ value, score }))
				.sort((a, b) => a.score - b.score);
			return entries.slice(start, start + 1);
		},
		expire: async () => {},
	}),
}));

const { enforceOauthRegistrationRateLimit, enforceOauthTokenRateLimit, enforceMcpRateLimit } =
	await import('@web/lib/request-rate-limiter');

describe('enforceOauthRegistrationRateLimit', () => {
	beforeEach(() => {
		sortedSets.clear();
	});

	it('allows requests under the limit', async () => {
		const input = {
			request: new Request('http://localhost/', {
				headers: { 'x-forwarded-for': '1.2.3.4' },
			}),
		};
		const result = await enforceOauthRegistrationRateLimit(input);
		expect(result.allowed).toBe(true);
	});

	it('denies requests over the limit', async () => {
		const input = {
			request: new Request('http://localhost/', {
				headers: { 'x-forwarded-for': '1.2.3.4' },
			}),
		};
		for (let i = 0; i < 3; i++) {
			await enforceOauthRegistrationRateLimit(input);
		}
		const result = await enforceOauthRegistrationRateLimit(input);
		expect(result.allowed).toBe(false);
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
	});
});

describe('enforceOauthTokenRateLimit', () => {
	beforeEach(() => {
		sortedSets.clear();
	});

	it('allows requests under the limit', async () => {
		const input = {
			request: new Request('http://localhost/', {
				headers: { 'x-forwarded-for': '5.6.7.8' },
			}),
		};
		const result = await enforceOauthTokenRateLimit(input);
		expect(result.allowed).toBe(true);
	});

	it('denies requests over the limit', async () => {
		const input = {
			request: new Request('http://localhost/', {
				headers: { 'x-forwarded-for': '5.6.7.8' },
			}),
		};
		for (let i = 0; i < 5; i++) {
			await enforceOauthTokenRateLimit(input);
		}
		const result = await enforceOauthTokenRateLimit(input);
		expect(result.allowed).toBe(false);
	});
});

describe('enforceMcpRateLimit', () => {
	beforeEach(() => {
		sortedSets.clear();
	});

	it('allows requests under the limit', async () => {
		const result = await enforceMcpRateLimit({ userId: 'user-1' });
		expect(result.allowed).toBe(true);
	});

	it('denies requests over the limit', async () => {
		for (let i = 0; i < 10; i++) {
			await enforceMcpRateLimit({ userId: 'user-1' });
		}
		const result = await enforceMcpRateLimit({ userId: 'user-1' });
		expect(result.allowed).toBe(false);
	});
});
