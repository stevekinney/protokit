import * as inMemoryStoreModule from './in-memory-sliding-window-store.js';
import * as concurrencyModule from './mcp-concurrency-limiter.js';
import * as responseModule from './rate-limit-response.js';
import * as redisStoreModule from './redis-sliding-window-store.js';
import * as requestLimiterModule from './request-rate-limiter.js';
import * as slidingWindowModule from './sliding-window-rate-limiter.js';

// Assign through module namespaces so Bun preserves the source bindings in the
// bundled subpath entry point. Forward-only exports are otherwise emitted as
// unbound names when this entry point is built with splitting enabled.
export const attachConcurrencySlotToResponseLifetime =
	concurrencyModule.attachConcurrencySlotToResponseLifetime;
export const createInMemoryConcurrencySlotStore =
	concurrencyModule.createInMemoryConcurrencySlotStore;
export const createInMemorySlidingWindowStore =
	inMemoryStoreModule.createInMemorySlidingWindowStore;
export const createRateLimitedResponse = responseModule.createRateLimitedResponse;
export const createRedisConcurrencySlotStore = concurrencyModule.createRedisConcurrencySlotStore;
export const createRedisSlidingWindowStore = redisStoreModule.createRedisSlidingWindowStore;
export const DEFAULT_CONCURRENCY_SLOT_RENEWAL_INTERVAL_MILLISECONDS =
	concurrencyModule.DEFAULT_CONCURRENCY_SLOT_RENEWAL_INTERVAL_MILLISECONDS;
export const DEFAULT_CONCURRENCY_SLOT_TTL_MILLISECONDS =
	concurrencyModule.DEFAULT_CONCURRENCY_SLOT_TTL_MILLISECONDS;
export const inMemorySlidingWindowStore = inMemoryStoreModule.inMemorySlidingWindowStore;
export const McpConcurrencyLimiter = concurrencyModule.McpConcurrencyLimiter;
export const RequestRateLimiter = requestLimiterModule.RequestRateLimiter;
export const SlidingWindowRateLimiter = slidingWindowModule.SlidingWindowRateLimiter;
export type McpConcurrencyLimiter = InstanceType<typeof concurrencyModule.McpConcurrencyLimiter>;
export type RequestRateLimiter = InstanceType<typeof requestLimiterModule.RequestRateLimiter>;
export type SlidingWindowRateLimiter = InstanceType<
	typeof slidingWindowModule.SlidingWindowRateLimiter
>;
export type { McpConcurrencySlot } from './mcp-concurrency-limiter.js';
export type {
	AtomicSlidingWindowStore,
	ConcurrencySlot,
	ConcurrencySlotStore,
	MinimalRedisClient,
	OAuthRateLimitCategory,
	RateLimitCategoryConfiguration,
	RateLimitConfiguration,
	SlidingWindowRateLimiterResult,
} from '../oauth/index.js';
