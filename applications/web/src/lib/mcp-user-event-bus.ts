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

	constructor(private readonly userId: string) {
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
				const subscriber = await getRedisSubscriberClient();
				await subscriber.subscribe(this.channel, (message) => {
					const event = deserializeEvent(message);
					if (!event) return;
					for (const listener of this.listeners) listener(event);
				});
				this.redisSubscribed = true;
			} catch (error) {
				logger.error(
					{ err: error, userId: this.userId },
					'Failed to subscribe to MCP resource event channel',
				);
			}
		} else {
			try {
				const subscriber = await getRedisSubscriberClient();
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
