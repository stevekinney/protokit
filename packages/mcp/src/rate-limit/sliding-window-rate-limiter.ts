import { randomUUID } from 'node:crypto';
import type { AtomicSlidingWindowStore, SlidingWindowRateLimiterResult } from '../oauth/index.js';

export class SlidingWindowRateLimiter {
	constructor(private readonly nowProvider: () => number = () => Date.now()) {}

	async consume(input: {
		key: string;
		maximumRequests: number;
		windowSeconds: number;
		atomicStore: AtomicSlidingWindowStore;
	}): Promise<SlidingWindowRateLimiterResult> {
		const nowMilliseconds = this.nowProvider();
		const windowMilliseconds = input.windowSeconds * 1000;
		const result = await input.atomicStore.consume({
			key: input.key,
			nowMilliseconds,
			windowMilliseconds,
			maximumRequests: input.maximumRequests,
			member: `${nowMilliseconds}-${randomUUID()}`,
		});

		return {
			allowed: result.allowed,
			retryAfterSeconds: result.allowed
				? 0
				: Math.max(1, Math.ceil(result.retryAfterMilliseconds / 1000)),
			remainingRequests: result.remainingRequests,
		};
	}

	async peek(input: {
		key: string;
		windowSeconds: number;
		atomicStore: AtomicSlidingWindowStore;
	}): Promise<number> {
		return input.atomicStore.peek({
			key: input.key,
			nowMilliseconds: this.nowProvider(),
			windowMilliseconds: input.windowSeconds * 1000,
		});
	}
}
