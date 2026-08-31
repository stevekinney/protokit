import type { ServerEvent, ServerEventBus } from '@modelcontextprotocol/server';
import { InMemoryServerEventBus } from '@modelcontextprotocol/server';

import type { CrossInstanceMessaging } from '../oauth/index.js';

const initialRetryDelayMilliseconds = 1_000;
const maximumRetryDelayMilliseconds = 30_000;

export type UserServerEventBus = ServerEventBus & { readonly listenerCount: number };

export type McpMessagingError = (input: {
	error: unknown;
	userId: string;
	operation: 'publish' | 'subscribe' | 'unsubscribe' | 'deserialize';
}) => void;

function channelForUser(userId: string): string {
	return `mcp:events:user:${userId}`;
}

function readServerEvent(message: string): ServerEvent | undefined {
	const parsed: unknown = JSON.parse(message);
	if (typeof parsed !== 'object' || parsed === null) return undefined;
	return typeof (parsed as { kind?: unknown }).kind === 'string'
		? (parsed as ServerEvent)
		: undefined;
}

/** A per-user event bus backed by the host's cross-instance messaging seam. */
export class CrossInstanceUserServerEventBus implements UserServerEventBus {
	private readonly listeners = new Set<(event: ServerEvent) => void>();
	private unsubscribeFromMessaging: (() => Promise<void>) | undefined;
	private transitionQueue: Promise<void> = Promise.resolve();
	private retryTimer: ReturnType<typeof setTimeout> | undefined;
	private retryDelayMilliseconds = initialRetryDelayMilliseconds;

	constructor(
		private readonly userId: string,
		private readonly messaging: CrossInstanceMessaging,
		private readonly onError: McpMessagingError = () => {},
	) {}

	get listenerCount(): number {
		return this.listeners.size;
	}

	publish(event: ServerEvent): void {
		let message: string;
		try {
			message = JSON.stringify(event);
		} catch (error) {
			this.onError({ error, userId: this.userId, operation: 'publish' });
			return;
		}
		void this.messaging
			.publish(channelForUser(this.userId), message)
			.catch((error: unknown) =>
				this.onError({ error, userId: this.userId, operation: 'publish' }),
			);
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

	async whenSubscribed(): Promise<void> {
		await this.transitionQueue;
	}

	private enqueueTransition(): Promise<void> {
		const transition = this.transitionQueue.then(
			() => this.reconcileSubscription(),
			() => this.reconcileSubscription(),
		);
		this.transitionQueue = transition;
		return transition;
	}

	private scheduleRetry(): void {
		if (this.retryTimer) return;
		const delay = this.retryDelayMilliseconds;
		this.retryDelayMilliseconds = Math.min(delay * 2, maximumRetryDelayMilliseconds);
		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined;
			const subscriptionMatchesDemand =
				(this.listeners.size === 0 && !this.unsubscribeFromMessaging) ||
				(this.listeners.size > 0 && Boolean(this.unsubscribeFromMessaging));
			if (subscriptionMatchesDemand) {
				this.retryDelayMilliseconds = initialRetryDelayMilliseconds;
				return;
			}
			void this.enqueueTransition();
		}, delay);
		this.retryTimer.unref?.();
	}

	private async reconcileSubscription(): Promise<void> {
		if (this.listeners.size > 0 && !this.unsubscribeFromMessaging) {
			try {
				this.unsubscribeFromMessaging = await this.messaging.subscribe(
					channelForUser(this.userId),
					(message) => {
						try {
							const event = readServerEvent(message);
							if (event) for (const listener of this.listeners) listener(event);
						} catch (error) {
							this.onError({ error, userId: this.userId, operation: 'deserialize' });
						}
					},
				);
				this.retryDelayMilliseconds = initialRetryDelayMilliseconds;
			} catch (error) {
				this.onError({ error, userId: this.userId, operation: 'subscribe' });
				this.scheduleRetry();
			}
			return;
		}
		if (this.listeners.size === 0 && this.unsubscribeFromMessaging) {
			const unsubscribe = this.unsubscribeFromMessaging;
			try {
				await unsubscribe();
				if (this.unsubscribeFromMessaging === unsubscribe) {
					this.unsubscribeFromMessaging = undefined;
				}
				this.retryDelayMilliseconds = initialRetryDelayMilliseconds;
			} catch (error) {
				this.onError({ error, userId: this.userId, operation: 'unsubscribe' });
				this.scheduleRetry();
			}
		}
	}
}

export function createUserServerEventBus(input: {
	userId: string;
	messaging?: CrossInstanceMessaging;
	onError?: McpMessagingError;
}): UserServerEventBus {
	return input.messaging
		? new CrossInstanceUserServerEventBus(input.userId, input.messaging, input.onError)
		: new InMemoryServerEventBus();
}
