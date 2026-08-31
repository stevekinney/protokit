import type { CrossInstanceMessaging } from '@lostgradient/mcp/oauth';
import { getRedisClient, getRedisSubscriberClient, isRedisConfigured } from '@web/lib/redis-client';

export function resolveMcpCrossInstanceMessaging(): CrossInstanceMessaging | undefined {
	if (!isRedisConfigured()) return undefined;
	return {
		publish: async (channel, message) => {
			const client = await getRedisClient();
			await client.publish(channel, message);
		},
		subscribe: async (channel, onMessage) => {
			const subscriber = await getRedisSubscriberClient();
			await subscriber.subscribe(channel, onMessage);
			return async () => {
				await subscriber.unsubscribe(channel, onMessage);
			};
		},
	};
}
