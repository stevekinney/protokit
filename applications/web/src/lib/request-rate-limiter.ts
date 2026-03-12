import type { RequestEvent } from '@sveltejs/kit';
import { environment } from '../env.js';
import { getRedisClient } from '$lib/redis-client';
import { getRequestClientIdentifier } from '$lib/request-client-identifier';
import {
	SlidingWindowRateLimiter,
	type SlidingWindowRateLimiterResult,
} from '$lib/sliding-window-rate-limiter';

const slidingWindowRateLimiter = new SlidingWindowRateLimiter();

function buildRateLimitKey(route: string, identifier: string): string {
	return `rate_limit:${route}:${identifier}`;
}

async function consumeRateLimit(input: {
	route: 'register' | 'token';
	identifier: string;
	maximumRequests: number;
	windowSeconds: number;
}): Promise<SlidingWindowRateLimiterResult> {
	const redisClient = await getRedisClient();
	const key = buildRateLimitKey(input.route, input.identifier);

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

export async function enforceRegistrationRateLimit(
	event: Pick<RequestEvent, 'request' | 'getClientAddress'>,
): Promise<SlidingWindowRateLimiterResult> {
	const clientIdentifier = getRequestClientIdentifier(event);

	return consumeRateLimit({
		route: 'register',
		identifier: clientIdentifier,
		maximumRequests: environment.RATE_LIMIT_REGISTER_MAX,
		windowSeconds: environment.RATE_LIMIT_REGISTER_WINDOW_SECONDS,
	});
}

export async function enforceTokenRateLimit(
	event: Pick<RequestEvent, 'request' | 'getClientAddress'>,
	clientId?: string,
): Promise<SlidingWindowRateLimiterResult> {
	const clientIdentifier = getRequestClientIdentifier(event);
	const identifier = clientId ? `${clientIdentifier}:${clientId}` : clientIdentifier;

	return consumeRateLimit({
		route: 'token',
		identifier,
		maximumRequests: environment.RATE_LIMIT_TOKEN_MAX,
		windowSeconds: environment.RATE_LIMIT_TOKEN_WINDOW_SECONDS,
	});
}
