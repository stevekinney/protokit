import type { ResourceSubscriptionBackend } from '@template/mcp';
import { logger } from '@template/mcp/logger';
import { getRedisClient, getRedisSubscriberClient } from '@web/lib/redis-client';

function channelForUri(uri: string): string {
	return `mcp:resource:updated:${uri}`;
}

class ResourceSubscriptionManager implements ResourceSubscriptionBackend {
	private channelSubscribers = new Map<string, Set<string>>();
	private updateCallbacks: Array<(uri: string) => void> = [];
	private subscriberReady = false;

	async subscribe(sessionIdentifier: string, uri: string): Promise<void> {
		const channel = channelForUri(uri);
		let sessions = this.channelSubscribers.get(channel);

		if (!sessions) {
			sessions = new Set<string>();
			this.channelSubscribers.set(channel, sessions);

			try {
				const subscriber = await getRedisSubscriberClient();
				if (!this.subscriberReady) {
					this.subscriberReady = true;
				}
				await subscriber.subscribe(channel, (message) => {
					for (const callback of this.updateCallbacks) {
						callback(message);
					}
				});
			} catch (error) {
				logger.error({ err: error, channel }, 'Failed to subscribe to Redis channel');
			}
		}

		sessions.add(sessionIdentifier);
	}

	async unsubscribe(sessionIdentifier: string, uri: string): Promise<void> {
		const channel = channelForUri(uri);
		const sessions = this.channelSubscribers.get(channel);
		if (!sessions) return;

		sessions.delete(sessionIdentifier);

		if (sessions.size === 0) {
			this.channelSubscribers.delete(channel);
			try {
				const subscriber = await getRedisSubscriberClient();
				await subscriber.unsubscribe(channel);
			} catch (error) {
				logger.error({ err: error, channel }, 'Failed to unsubscribe from Redis channel');
			}
		}
	}

	async unsubscribeAll(sessionIdentifier: string): Promise<void> {
		const channelsToRemove: string[] = [];

		for (const [channel, sessions] of this.channelSubscribers) {
			sessions.delete(sessionIdentifier);
			if (sessions.size === 0) {
				channelsToRemove.push(channel);
			}
		}

		for (const channel of channelsToRemove) {
			this.channelSubscribers.delete(channel);
			try {
				const subscriber = await getRedisSubscriberClient();
				await subscriber.unsubscribe(channel);
			} catch (error) {
				logger.error({ err: error, channel }, 'Failed to unsubscribe from Redis channel');
			}
		}
	}

	onResourceUpdated(callback: (uri: string) => void): void {
		this.updateCallbacks.push(callback);
	}

	async publishResourceUpdate(uri: string): Promise<void> {
		const channel = channelForUri(uri);
		try {
			const client = await getRedisClient();
			await client.publish(channel, uri);
		} catch (error) {
			logger.error({ err: error, uri }, 'Failed to publish resource update');
		}
	}

	getSubscribedSessionsForUri(uri: string): Set<string> {
		const channel = channelForUri(uri);
		return this.channelSubscribers.get(channel) ?? new Set();
	}
}

export const resourceSubscriptionManager = new ResourceSubscriptionManager();
