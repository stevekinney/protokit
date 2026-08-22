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
	private subscribing: Promise<void> | undefined;

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
		void this.ensureRedisSubscribed();

		let live = true;
		return () => {
			if (!live) return;
			live = false;
			this.listeners.delete(listener);
			if (this.listeners.size === 0) {
				void this.teardownRedisSubscription();
			}
		};
	}

	/**
	 * Resolves once this bus's Redis `SUBSCRIBE` has genuinely completed (or
	 * immediately, if it already had). `subscribe()` itself must stay
	 * synchronous to satisfy the `ServerEventBus` interface, so a `publish()`
	 * issued immediately after `subscribe()` can otherwise race ahead of the
	 * actual Redis command — in real usage the listen router's own
	 * ack round trip over the network all but rules this out, but tests (and
	 * any other caller that wants a hard guarantee) can await this instead
	 * of a fixed delay.
	 */
	async whenSubscribed(): Promise<void> {
		if (this.redisSubscribed) return;
		await (this.subscribing ?? this.ensureRedisSubscribed());
	}

	private async ensureRedisSubscribed(): Promise<void> {
		if (this.redisSubscribed) return;
		if (this.subscribing) {
			await this.subscribing;
			return;
		}
		this.subscribing = (async () => {
			try {
				const subscriber = await getRedisSubscriberClient();
				await subscriber.subscribe(this.channel, (message) => {
					const event = deserializeEvent(message);
					if (!event) return;
					for (const listener of this.listeners) listener(event);
				});
				this.redisSubscribed = true;
				// A review finding (P2): if the last listener unsubscribed
				// while the `SUBSCRIBE` above was still in flight,
				// `subscribe()`'s returned teardown function already ran and
				// found `redisSubscribed` still `false`, so it was a no-op —
				// this subscription would otherwise be retained in Redis
				// forever with nothing left to deliver to. Re-check now that
				// the subscription is genuinely live, and tear it down
				// immediately if every listener is already gone.
				if (this.listeners.size === 0) {
					void this.teardownRedisSubscription();
				}
			} catch (error) {
				logger.error(
					{ err: error, userId: this.userId },
					'Failed to subscribe to MCP resource event channel',
				);
			}
		})();
		try {
			await this.subscribing;
		} finally {
			this.subscribing = undefined;
		}
	}

	private async teardownRedisSubscription(): Promise<void> {
		if (!this.redisSubscribed) return;
		this.redisSubscribed = false;
		try {
			const subscriber = await getRedisSubscriberClient();
			await subscriber.unsubscribe(this.channel);
		} catch (error) {
			logger.error(
				{ err: error, userId: this.userId },
				'Failed to unsubscribe from MCP resource event channel',
			);
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
