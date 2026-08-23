import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { logger } from '@template/mcp/logger';
import type { UserServerEventBus } from '@web/lib/mcp-user-event-bus';

export type McpUserHandlerEntry = {
	handler: McpHttpHandler;
	bus: UserServerEventBus;
	lastAccessedAt: number;
};

/**
 * PROTO-002 / S-11: one `McpHttpHandler` (and therefore one
 * `subscriptions/listen` event bus) per authenticated user — see
 * `mcp-user-event-bus.ts` for why that topology, not the bus's own
 * filtering, is what makes cross-user delivery impossible.
 *
 * Bounded so this in-process registry cannot grow without limit: an entry
 * with no open `subscriptions/listen` stream (`bus.listenerCount === 0`)
 * and no request in the last `idleMs` is evicted and its handler closed —
 * "disconnecting a streaming client... releases resources" holds for the
 * handler-level resource (the bus's Redis subscription, the SDK's internal
 * in-flight-instance set), not only for the individual stream the SDK
 * itself already tears down on abort.
 *
 * Correctness never depends on any single instance holding a particular
 * user's entry: `RedisUserServerEventBus.publish` fans out over Redis, so
 * whichever process/instance currently holds an open stream for that user
 * receives the event regardless of which instance is handling the request
 * that triggered the update (PROTO-001's own "no sticky routing" invariant,
 * carried forward here rather than reintroduced).
 */
export class McpUserHandlerCache {
	private readonly entries = new Map<string, McpUserHandlerEntry>();
	private sweepTimer: ReturnType<typeof setInterval> | undefined;

	constructor(
		private readonly createEntry: (userId: string) => Omit<McpUserHandlerEntry, 'lastAccessedAt'>,
		private readonly now: () => number = Date.now,
	) {}

	get size(): number {
		return this.entries.size;
	}

	/**
	 * Returns this user's handler entry if one already exists, without
	 * creating one and without touching `lastAccessedAt`. Used by
	 * out-of-request publishers (`publishUserResourceUpdate`) that want to
	 * reuse an already-live handler's bus when one exists, rather than
	 * spinning up a handler (and its Redis subscription) purely to publish
	 * to a channel nothing local is listening on.
	 */
	peek(userId: string): McpUserHandlerEntry | undefined {
		return this.entries.get(userId);
	}

	/** Returns this user's handler, creating one on first use, and marks it recently accessed. */
	get(userId: string): McpUserHandlerEntry {
		let entry = this.entries.get(userId);
		if (!entry) {
			entry = { ...this.createEntry(userId), lastAccessedAt: this.now() };
			this.entries.set(userId, entry);
			return entry;
		}
		entry.lastAccessedAt = this.now();
		return entry;
	}

	/**
	 * Evicts every entry that is both idle (no request in `idleMs`) and has
	 * no open `subscriptions/listen` stream, closing each evicted handler.
	 * Pure with respect to time (uses the injected `now`), so this is unit
	 * testable without real timers. Returns the evicted user IDs.
	 */
	evictIdle(idleMs: number): string[] {
		const cutoff = this.now() - idleMs;
		const toEvict: string[] = [];
		for (const [userId, entry] of this.entries) {
			if (entry.bus.listenerCount === 0 && entry.lastAccessedAt <= cutoff) {
				toEvict.push(userId);
			}
		}
		for (const userId of toEvict) {
			const entry = this.entries.get(userId);
			this.entries.delete(userId);
			if (entry) {
				void entry.handler.close().catch((error: unknown) => {
					logger.error({ err: error, userId }, 'Failed to close idle MCP user handler');
				});
			}
		}
		return toEvict;
	}

	/** Starts the periodic idle sweep. Safe to call once; a second call replaces the previous timer. */
	startSweep(intervalMs: number, idleMs: number): void {
		if (this.sweepTimer) clearInterval(this.sweepTimer);
		this.sweepTimer = setInterval(() => this.evictIdle(idleMs), intervalMs);
		this.sweepTimer.unref?.();
	}

	/** Stops the sweep and closes every handler — used at process shutdown. */
	async closeAll(): Promise<void> {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer);
			this.sweepTimer = undefined;
		}
		const closings = [...this.entries.values()].map((entry) =>
			entry.handler.close().catch((error: unknown) => {
				logger.error({ err: error }, 'Failed to close MCP user handler during shutdown');
			}),
		);
		this.entries.clear();
		await Promise.all(closings);
	}
}
