import { randomUUID } from 'node:crypto';
import type { ConcurrencySlotStore, MinimalRedisClient } from '../oauth/index.js';

export const DEFAULT_CONCURRENCY_SLOT_TTL_MILLISECONDS = 60_000;
export const DEFAULT_CONCURRENCY_SLOT_RENEWAL_INTERVAL_MILLISECONDS = 20_000;

const acquireScript = `
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local ttl_ms = tonumber(ARGV[2])
local max_concurrent = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now_ms)
local count = redis.call('ZCARD', key)
if count >= max_concurrent then return 0 end
redis.call('ZADD', key, now_ms + ttl_ms, member)
redis.call('PEXPIRE', key, ttl_ms)
return 1
`;

const renewScript = `
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local ttl_ms = tonumber(ARGV[2])
local member = ARGV[3]
if redis.call('ZSCORE', key, member) == false then return 0 end
redis.call('ZADD', key, now_ms + ttl_ms, member)
redis.call('PEXPIRE', key, ttl_ms)
return 1
`;

export function createRedisConcurrencySlotStore(
	redisClient: MinimalRedisClient,
	providers: { now?: () => number; createId?: () => string } = {},
): ConcurrencySlotStore {
	const now = providers.now ?? (() => Date.now());
	const createId = providers.createId ?? randomUUID;
	return {
		acquire: async (key, maximumConcurrent, ttlMilliseconds) => {
			const slot = { id: createId() };
			const reply = await redisClient.eval(acquireScript, {
				keys: [key],
				arguments: [String(now()), String(ttlMilliseconds), String(maximumConcurrent), slot.id],
			});
			return reply === 1 ? slot : null;
		},
		renew: async (key, slot, ttlMilliseconds) =>
			(await redisClient.eval(renewScript, {
				keys: [key],
				arguments: [String(now()), String(ttlMilliseconds), slot.id],
			})) === 1,
		release: async (key, slot) => {
			await redisClient.zRem(key, slot.id);
		},
	};
}

export function createInMemoryConcurrencySlotStore(): ConcurrencySlotStore {
	const slotsByKey = new Map<string, Set<string>>();
	return {
		acquire: async (key, maximumConcurrent) => {
			const slots = slotsByKey.get(key) ?? new Set<string>();
			if (slots.size >= maximumConcurrent) return null;
			const slot = { id: randomUUID() };
			slots.add(slot.id);
			slotsByKey.set(key, slots);
			return slot;
		},
		renew: async (key, slot) => slotsByKey.get(key)?.has(slot.id) ?? false,
		release: async (key, slot) => {
			slotsByKey.get(key)?.delete(slot.id);
		},
	};
}

export type McpConcurrencySlot = {
	allowed: boolean;
	/** Renewal cadence derived from the acquired slot's TTL. */
	renewalIntervalMilliseconds: number;
	release(): Promise<void>;
	renew(): Promise<void>;
};

export class McpConcurrencyLimiter {
	constructor(
		private readonly store: ConcurrencySlotStore,
		private readonly maximumConcurrent: number,
		private readonly ttlMilliseconds = DEFAULT_CONCURRENCY_SLOT_TTL_MILLISECONDS,
		private readonly onStoreError: (
			error: unknown,
			operation: 'release' | 'renew',
		) => void = () => {},
	) {}

	async acquire(key: string): Promise<McpConcurrencySlot> {
		const slot = await this.store.acquire(key, this.maximumConcurrent, this.ttlMilliseconds);
		let released = false;
		return {
			allowed: slot !== null,
			renewalIntervalMilliseconds: Math.max(1, Math.floor(this.ttlMilliseconds / 3)),
			release: async () => {
				if (!slot || released) return;
				released = true;
				try {
					await this.store.release(key, slot);
				} catch (error) {
					this.onStoreError(error, 'release');
				}
			},
			renew: async () => {
				if (!slot || released) return;
				try {
					await this.store.renew(key, slot, this.ttlMilliseconds);
				} catch (error) {
					this.onStoreError(error, 'renew');
				}
			},
		};
	}
}

export function attachConcurrencySlotToResponseLifetime(
	response: Response,
	slot: Omit<McpConcurrencySlot, 'renewalIntervalMilliseconds'> & {
		renewalIntervalMilliseconds?: number;
	},
	renewalIntervalMilliseconds = slot.renewalIntervalMilliseconds ??
		DEFAULT_CONCURRENCY_SLOT_RENEWAL_INTERVAL_MILLISECONDS,
): Response {
	if (!response.body || response.bodyUsed) {
		void slot.release();
		return response;
	}
	let settled = false;
	const renewalTimer = setInterval(() => void slot.renew(), renewalIntervalMilliseconds);
	renewalTimer.unref?.();
	const settleOnce = () => {
		if (settled) return;
		settled = true;
		clearInterval(renewalTimer);
		void slot.release();
	};
	const sourceReader = response.body.getReader();
	const trackedBody = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { done, value } = await sourceReader.read();
				if (done) {
					controller.close();
					settleOnce();
					return;
				}
				controller.enqueue(value);
			} catch (error) {
				controller.error(error);
				settleOnce();
			}
		},
		cancel(reason) {
			void sourceReader.cancel(reason).catch(() => {});
			settleOnce();
		},
	});
	return new Response(trackedBody, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}
