import type {
	AtomicSlidingWindowStore,
	OAuthRateLimitCategory,
	RateLimitConfiguration,
	SlidingWindowRateLimiterResult,
} from '../oauth/index.js';
import { SlidingWindowRateLimiter } from './sliding-window-rate-limiter.js';

export class RequestRateLimiter {
	readonly #limiter: SlidingWindowRateLimiter;

	constructor(
		private readonly configuration: RateLimitConfiguration,
		private readonly storeProvider: () =>
			AtomicSlidingWindowStore | Promise<AtomicSlidingWindowStore>,
		nowProvider?: () => number,
	) {
		this.#limiter = new SlidingWindowRateLimiter(nowProvider);
	}

	async consume(
		category: OAuthRateLimitCategory,
		identifier: string,
	): Promise<SlidingWindowRateLimiterResult> {
		const categoryConfiguration = this.configuration.categories[category];
		return this.#limiter.consume({
			key: this.buildKey(category, identifier),
			...categoryConfiguration,
			atomicStore: await this.storeProvider(),
		});
	}

	async peek(category: OAuthRateLimitCategory, identifier: string): Promise<number> {
		return this.#limiter.peek({
			key: this.buildKey(category, identifier),
			windowSeconds: this.configuration.categories[category].windowSeconds,
			atomicStore: await this.storeProvider(),
		});
	}

	private buildKey(category: OAuthRateLimitCategory, identifier: string): string {
		const namespace = this.configuration.keyNamespace;
		return namespace
			? `rate_limit:${namespace}:${category}:${identifier}`
			: `rate_limit:${category}:${identifier}`;
	}
}
