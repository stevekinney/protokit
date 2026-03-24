import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';
import { inMemorySortedSetStore } from '@web/lib/in-memory-sorted-set-store';
import { isRedisConfigured, getRedisClient } from '@web/lib/redis-client';
import { getRequestClientIdentifier } from '@web/lib/request-client-identifier';
import {
	SlidingWindowRateLimiter,
	type SlidingWindowRateLimiterResult,
} from '@web/lib/sliding-window-rate-limiter';

const slidingWindowRateLimiter = new SlidingWindowRateLimiter();

let warnedAboutInMemoryRateLimiter = false;

function buildRateLimitKey(route: string, identifier: string): string {
	return `rate_limit:${route}:${identifier}`;
}

async function consumeRateLimit(input: {
	route: 'oauth_register' | 'oauth_token' | 'mcp';
	identifier: string;
	maximumRequests: number;
	windowSeconds: number;
}): Promise<SlidingWindowRateLimiterResult> {
	const key = buildRateLimitKey(input.route, input.identifier);

	if (!isRedisConfigured()) {
		if (!warnedAboutInMemoryRateLimiter) {
			logger.warn('REDIS_URL not set — using in-memory rate limiter. Not suitable for production.');
			warnedAboutInMemoryRateLimiter = true;
		}

		return slidingWindowRateLimiter.consume({
			key,
			maximumRequests: input.maximumRequests,
			windowSeconds: input.windowSeconds,
			sortedSetStore: inMemorySortedSetStore,
		});
	}

	const redisClient = await getRedisClient();

	return slidingWindowRateLimiter.consume({
		key,
		maximumRequests: input.maximumRequests,
		windowSeconds: input.windowSeconds,
		sortedSetStore: {
			removeRangeByScore: async (sortedSetKey, minimumScore, maximumScore) => {
				await redisClient.zRemRangeByScore(sortedSetKey, minimumScore, maximumScore);
			},
			count: async (sortedSetKey) => {
				return redisClient.zCard(sortedSetKey);
			},
			add: async (sortedSetKey, score, member) => {
				await redisClient.zAdd(sortedSetKey, [{ score, value: member }]);
			},
			getOldestScore: async (sortedSetKey) => {
				const oldestEntries = await redisClient.zRangeWithScores(sortedSetKey, 0, 0);
				return oldestEntries[0]?.score ?? null;
			},
			expire: async (sortedSetKey, seconds) => {
				await redisClient.expire(sortedSetKey, seconds);
			},
		},
	});
}

export async function enforceOauthRegistrationRateLimit(input: {
	request: Request;
	fallbackClientAddress?: string;
}): Promise<SlidingWindowRateLimiterResult> {
	const clientIdentifier = getRequestClientIdentifier(input);

	return consumeRateLimit({
		route: 'oauth_register',
		identifier: clientIdentifier,
		maximumRequests: environment.RATE_LIMIT_REGISTER_MAX,
		windowSeconds: environment.RATE_LIMIT_REGISTER_WINDOW_SECONDS,
	});
}

export async function enforceOauthTokenRateLimit(input: {
	request: Request;
	clientId?: string;
	fallbackClientAddress?: string;
}): Promise<SlidingWindowRateLimiterResult> {
	const clientIdentifier = getRequestClientIdentifier(input);
	const identifier = input.clientId ? `${clientIdentifier}:${input.clientId}` : clientIdentifier;

	return consumeRateLimit({
		route: 'oauth_token',
		identifier,
		maximumRequests: environment.RATE_LIMIT_TOKEN_MAX,
		windowSeconds: environment.RATE_LIMIT_TOKEN_WINDOW_SECONDS,
	});
}

export async function enforceMcpRateLimit(input: {
	userId: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'mcp',
		identifier: input.userId,
		maximumRequests: environment.RATE_LIMIT_MCP_MAX,
		windowSeconds: environment.RATE_LIMIT_MCP_WINDOW_SECONDS,
	});
}
