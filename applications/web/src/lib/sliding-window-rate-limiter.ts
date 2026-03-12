import { randomUUID } from 'node:crypto';

export type SlidingWindowRateLimiterResult = {
	allowed: boolean;
	retryAfterSeconds: number;
	remainingRequests: number;
};

export class SlidingWindowRateLimiter {
	constructor(private readonly nowProvider: () => number = () => Date.now()) {}

	async consume(input: {
		key: string;
		maximumRequests: number;
		windowSeconds: number;
		sortedSetStore: {
			removeRangeByScore: (
				key: string,
				minimumScore: number,
				maximumScore: number,
			) => Promise<void>;
			count: (key: string) => Promise<number>;
			add: (key: string, score: number, member: string) => Promise<void>;
			getOldestScore: (key: string) => Promise<number | null>;
			expire: (key: string, seconds: number) => Promise<void>;
		};
	}): Promise<SlidingWindowRateLimiterResult> {
		const now = this.nowProvider();
		const windowMilliseconds = input.windowSeconds * 1000;
		const cutoffTimestamp = now - windowMilliseconds;

		await input.sortedSetStore.removeRangeByScore(input.key, 0, cutoffTimestamp);
		const requestCount = await input.sortedSetStore.count(input.key);

		if (requestCount >= input.maximumRequests) {
			const oldestScore = await input.sortedSetStore.getOldestScore(input.key);
			const retryAfterSeconds = oldestScore
				? Math.max(1, Math.ceil((oldestScore + windowMilliseconds - now) / 1000))
				: input.windowSeconds;

			return {
				allowed: false,
				retryAfterSeconds,
				remainingRequests: 0,
			};
		}

		const member = `${now}-${randomUUID()}`;
		await input.sortedSetStore.add(input.key, now, member);
		await input.sortedSetStore.expire(input.key, input.windowSeconds);

		return {
			allowed: true,
			retryAfterSeconds: 0,
			remainingRequests: Math.max(0, input.maximumRequests - requestCount - 1),
		};
	}
}
