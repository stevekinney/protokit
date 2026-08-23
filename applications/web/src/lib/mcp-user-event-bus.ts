import type { ServerEvent, ServerEventBus } from '@modelcontextprotocol/server';
import { InMemoryServerEventBus } from '@modelcontextprotocol/server';
import { logger } from '@template/mcp/logger';
import { isRedisConfigured, getRedisClient, getRedisSubscriberClient } from '@web/lib/redis-client';

function channelForUser(userId: string): string {
	return `mcp:events:user:${userId}`;
}

function isServerEvent(value: unknown): value is ServerEvent {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { kind?: unknown }).kind === 'string'
	);
}

/** Initial delay before retrying a failed Redis `SUBSCRIBE`; doubles on each consecutive failure up to `MAX_RESUBSCRIBE_RETRY_DELAY_MILLISECONDS`. */
const INITIAL_RESUBSCRIBE_RETRY_DELAY_MILLISECONDS = 1_000;
const MAX_RESUBSCRIBE_RETRY_DELAY_MILLISECONDS = 30_000;

function deserializeEvent(message: string): ServerEvent | undefined {
	try {
		const parsed: unknown = JSON.parse(message);
		return isServerEvent(parsed) ? parsed : undefined;
	} catch (error) {
		logger.error({ err: error }, 'Failed to parse MCP resource event payload');
		return undefined;
	}
}

/**
 * A `ServerEventBus` (the SDK's pluggable transport for the `2026-07-28`
 * `subscriptions/listen` stream) scoped to exactly one authenticated user,
 * backed by Redis pub/sub.
 *
 * S-11: the SDK's own `subscriptions/listen` implementation filters
 * delivery purely by event kind and resource URI — it has no notion of
 * caller identity, and `createMcpHandler` binds exactly one bus per handler
 * instance for that instance's whole lifetime. Per-user isolation therefore
 * has to come from bus TOPOLOGY, not from anything the SDK's listen router
 * does: `mcp-handler.ts` constructs one `McpHttpHandler` — and therefore
 * one bus — per authenticated user. A `publish()` call for one user's
 * resource update is published only to that user's Redis channel, so it is
 * physically unreachable from another user's `subscriptions/listen`
 * stream, which is registered against a different bus instance entirely.
 */
export class RedisUserServerEventBus implements ServerEventBus {
	private readonly channel: string;
	private readonly listeners = new Set<(event: ServerEvent) => void>();
	private redisSubscribed = false;
	/**
	 * A review finding (P2): the last listener's teardown (unsubscribe) and
	 * a replacement listener's setup (subscribe) each used to kick off their
	 * own independent async Redis call, gated only by a boolean flag with no
	 * mutual exclusion. If a replacement subscribed while the old teardown's
	 * `UNSUBSCRIBE` was still in flight, the replacement's `SUBSCRIBE` could
	 * set `redisSubscribed = true`, and then the older teardown's own
	 * `UNSUBSCRIBE` could land afterward and actually remove the Redis
	 * subscription — leaving the bus's internal flag claiming "subscribed"
	 * while Redis itself had nothing registered, silently dropping all
	 * future events for that user until the handler was recreated.
	 *
	 * Every subscribe/unsubscribe transition is now appended to this single
	 * chain and runs strictly one after another, in request order — a
	 * teardown and a replacement subscribe can never race each other's
	 * Redis command, regardless of how the underlying client happens to
	 * schedule its own response microtasks.
	 */
	private transitionQueue: Promise<void> = Promise.resolve();

	/**
	 * A review finding (P2): a transient `SUBSCRIBE` failure left
	 * `redisSubscribed` false with nothing scheduled to try again, while
	 * the listener stayed registered. Because `reconcileSubscription` only
	 * runs when `subscribe()`/the unsubscribe teardown enqueue a new
	 * transition, a single failed attempt meant a `subscriptions/listen`
	 * stream stayed open indefinitely, silently receiving nothing — even
	 * after Redis recovered. Retries with exponential backoff (capped, and
	 * `unref`'d so a pending retry never keeps the process alive) for as
	 * long as at least one listener is still registered; stops rescheduling
	 * itself the moment the listener count drops to zero, and resets on
	 * the next successful subscribe.
	 */
	private resubscribeRetryTimer: ReturnType<typeof setTimeout> | null = null;
	private resubscribeRetryDelayMilliseconds = INITIAL_RESUBSCRIBE_RETRY_DELAY_MILLISECONDS;

	constructor(
		private readonly userId: string,
		// Defaults to the real client factory; a test can inject a stub that
		// fails a bounded number of times to prove the retry path without
		// needing to actually sever this process's connection to the shared
		// Redis instance.
		private readonly getSubscriberClient: typeof getRedisSubscriberClient = getRedisSubscriberClient,
	) {
		this.channel = channelForUser(userId);
	}

	/**
	 * Number of currently registered listeners (i.e. open
	 * `subscriptions/listen` streams for this user, across every open
	 * request). `mcp-handler.ts` uses this to decide when this user's
	 * handler is idle enough to evict from its bounded cache.
	 */
	get listenerCount(): number {
		return this.listeners.size;
	}

	publish(event: ServerEvent): void {
		void getRedisClient()
			.then((client) => client.publish(this.channel, JSON.stringify(event)))
			.catch((error) => {
				logger.error({ err: error, userId: this.userId }, 'Failed to publish MCP resource event');
			});
	}

	subscribe(listener: (event: ServerEvent) => void): () => void {
		this.listeners.add(listener);
		void this.enqueueTransition();

		let live = true;
		return () => {
			if (!live) return;
			live = false;
			this.listeners.delete(listener);
			void this.enqueueTransition();
		};
	}

	/**
	 * Resolves once every subscribe/unsubscribe transition requested up to
	 * this call has genuinely settled against Redis. `subscribe()` itself
	 * must stay synchronous to satisfy the `ServerEventBus` interface, so a
	 * `publish()` issued immediately after `subscribe()` can otherwise race
	 * ahead of the actual Redis command — in real usage the listen router's
	 * own ack round trip over the network all but rules this out, but tests
	 * (and any other caller that wants a hard guarantee) can await this
	 * instead of a fixed delay.
	 */
	async whenSubscribed(): Promise<void> {
		await this.transitionQueue;
	}

	private scheduleResubscribeRetry(): void {
		if (this.resubscribeRetryTimer) return;
		const delay = this.resubscribeRetryDelayMilliseconds;
		this.resubscribeRetryDelayMilliseconds = Math.min(
			this.resubscribeRetryDelayMilliseconds * 2,
			MAX_RESUBSCRIBE_RETRY_DELAY_MILLISECONDS,
		);
		this.resubscribeRetryTimer = setTimeout(() => {
			this.resubscribeRetryTimer = null;
			// A listener may have torn down (or the bus may already be
			// re-subscribed by an unrelated transition) while this retry was
			// pending -- only re-enter the queue if there is still someone to
			// deliver events to and Redis still isn't subscribed.
			if (this.listeners.size === 0 || this.redisSubscribed) {
				this.resubscribeRetryDelayMilliseconds = INITIAL_RESUBSCRIBE_RETRY_DELAY_MILLISECONDS;
				return;
			}
			void this.enqueueTransition();
		}, delay);
		this.resubscribeRetryTimer.unref?.();
	}

	private enqueueTransition(): Promise<void> {
		const next = this.transitionQueue.then(
			() => this.reconcileSubscription(),
			() => this.reconcileSubscription(),
		);
		this.transitionQueue = next;
		return next;
	}

	/**
	 * Brings the real Redis subscription in line with the CURRENT listener
	 * set, read fresh at the moment this runs (never a snapshot captured
	 * when it was enqueued). Because every call is serialized through
	 * `transitionQueue`, this always observes the true state left behind by
	 * whichever transition ran immediately before it.
	 */
	private async reconcileSubscription(): Promise<void> {
		const shouldBeSubscribed = this.listeners.size > 0;
		if (shouldBeSubscribed === this.redisSubscribed) return;

		if (shouldBeSubscribed) {
			try {
				const subscriber = await this.getSubscriberClient();
				await subscriber.subscribe(this.channel, (message) => {
					const event = deserializeEvent(message);
					if (!event) return;
					for (const listener of this.listeners) listener(event);
				});
				this.redisSubscribed = true;
				this.resubscribeRetryDelayMilliseconds = INITIAL_RESUBSCRIBE_RETRY_DELAY_MILLISECONDS;
			} catch (error) {
				logger.error(
					{ err: error, userId: this.userId },
					'Failed to subscribe to MCP resource event channel; scheduling retry',
				);
				this.scheduleResubscribeRetry();
			}
		} else {
			try {
				const subscriber = await this.getSubscriberClient();
				await subscriber.unsubscribe(this.channel);
				this.redisSubscribed = false;
			} catch (error) {
				logger.error(
					{ err: error, userId: this.userId },
					'Failed to unsubscribe from MCP resource event channel',
				);
			}
		}
	}
}

export type UserServerEventBus = ServerEventBus & { readonly listenerCount: number };

/**
 * Selects a Redis-backed bus when Redis is configured, matching the
 * existing selection pattern for other Redis-optional features in this
 * codebase — an in-memory bus otherwise (single-process only; fine for
 * local development, not for a multi-instance deployment).
 */
export function createUserServerEventBus(userId: string): UserServerEventBus {
	if (isRedisConfigured()) {
		return new RedisUserServerEventBus(userId);
	}
	return new InMemoryServerEventBus();
}

// `publishUserResourceUpdate` (the publish-side counterpart callers use
// from outside the request path that owns a live `McpHttpHandler` — see
// its own doc comment in `mcp-handler.ts`) lives there rather than here.
// It needs to be able to reuse an already-live handler's bus for the
// in-memory (Redis not configured) fallback, and only `mcp-handler.ts`
// holds the `McpUserHandlerCache` that tracks which handler/bus instance
// is actually live for a given user in this process.
