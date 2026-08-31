import type { McpHttpHandler } from '@modelcontextprotocol/server';

import type { UserServerEventBus } from './user-server-event-bus.js';

export type McpUserHandlerEntry = {
	handler: McpHttpHandler;
	bus: UserServerEventBus;
	lastAccessedAt: number;
};

export type McpHandlerLifecycleError = (input: {
	error: unknown;
	userId?: string;
	operation: 'evict' | 'revoke' | 'shutdown';
}) => void;

/**
 * Maintains one handler and event bus per durable subject. This topology is
 * the authorization boundary that prevents one user's subscription events
 * from reaching another user who subscribes to the same resource URI.
 *
 * Entries are bounded by idleness: an entry with no open listener and no
 * request inside `idleMilliseconds` is evicted by `evictIdle` or `startSweep`.
 */
export class McpUserHandlerCache {
	private readonly entries = new Map<string, McpUserHandlerEntry>();
	private sweepTimer: ReturnType<typeof setInterval> | undefined;

	constructor(
		private readonly createEntry: (userId: string) => Omit<McpUserHandlerEntry, 'lastAccessedAt'>,
		private readonly now: () => number = Date.now,
		private readonly onError: McpHandlerLifecycleError = () => {},
	) {}

	get size(): number {
		return this.entries.size;
	}

	peek(userId: string): McpUserHandlerEntry | undefined {
		return this.entries.get(userId);
	}

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

	evictIdle(idleMilliseconds: number): string[] {
		const cutoff = this.now() - idleMilliseconds;
		const evictedUserIds: string[] = [];
		for (const [userId, entry] of this.entries) {
			if (entry.bus.listenerCount === 0 && entry.lastAccessedAt <= cutoff) {
				evictedUserIds.push(userId);
			}
		}
		for (const userId of evictedUserIds) {
			const entry = this.entries.get(userId);
			this.entries.delete(userId);
			if (entry) {
				void entry.handler.close().catch((error: unknown) => {
					this.onError({ error, userId, operation: 'evict' });
				});
			}
		}
		return evictedUserIds;
	}

	async closeUser(userId: string): Promise<boolean> {
		const entry = this.entries.get(userId);
		if (!entry) return false;
		this.entries.delete(userId);
		await entry.handler.close().catch((error: unknown) => {
			this.onError({ error, userId, operation: 'revoke' });
		});
		return true;
	}

	startSweep(intervalMilliseconds: number, idleMilliseconds: number): void {
		if (this.sweepTimer) clearInterval(this.sweepTimer);
		this.sweepTimer = setInterval(() => this.evictIdle(idleMilliseconds), intervalMilliseconds);
		this.sweepTimer.unref?.();
	}

	async closeAll(): Promise<void> {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer);
			this.sweepTimer = undefined;
		}
		const closings = [...this.entries.entries()].map(([userId, entry]) =>
			entry.handler.close().catch((error: unknown) => {
				this.onError({ error, userId, operation: 'shutdown' });
			}),
		);
		this.entries.clear();
		await Promise.all(closings);
	}
}
