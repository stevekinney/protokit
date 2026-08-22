import { randomUUID } from 'node:crypto';

export type SlidingWindowRateLimiterResult = {
	allowed: boolean;
	retryAfterSeconds: number;
	remainingRequests: number;
};

/**
 * A single atomic admission decision over a sliding window: prune expired
 * members, count what remains, and — only if under the limit — admit the
 * new member, all as one indivisible operation. Implementations must not
 * split this into separate remove/count/add round trips, since that reopens
 * the race the interface exists to close.
 */
export type AtomicSlidingWindowStore = {
	consume: (input: {
		key: string;
		nowMilliseconds: number;
		windowMilliseconds: number;
		maximumRequests: number;
		member: string;
	}) => Promise<{
		allowed: boolean;
		retryAfterMilliseconds: number;
		remainingRequests: number;
	}>;
	/**
	 * A best-effort, non-atomic read of the current member count after
	 * pruning expired entries. Suitable only for advisory checks (such as a
	 * failed-authentication lockout pre-check) that tolerate an off-by-one
	 * race — never for admission control.
	 */
	peek: (input: {
		key: string;
		nowMilliseconds: number;
		windowMilliseconds: number;
	}) => Promise<number>;
};

export class SlidingWindowRateLimiter {
	constructor(private readonly nowProvider: () => number = () => Date.now()) {}

	async consume(input: {
		key: string;
		maximumRequests: number;
		windowSeconds: number;
		atomicStore: AtomicSlidingWindowStore;
	}): Promise<SlidingWindowRateLimiterResult> {
		const now = this.nowProvider();
		const windowMilliseconds = input.windowSeconds * 1000;
		const member = `${now}-${randomUUID()}`;

		const result = await input.atomicStore.consume({
			key: input.key,
			nowMilliseconds: now,
			windowMilliseconds,
			maximumRequests: input.maximumRequests,
			member,
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
		const now = this.nowProvider();
		return input.atomicStore.peek({
			key: input.key,
			nowMilliseconds: now,
			windowMilliseconds: input.windowSeconds * 1000,
		});
	}
}
