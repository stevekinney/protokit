import { afterEach, describe, expect, it } from 'bun:test';
import { GrantRevocationChannel } from '@lostgradient/mcp/http';
import { resolveMcpCrossInstanceMessaging } from '@web/lib/mcp-cross-instance-messaging';

type GrantRevocationChannelInstance = InstanceType<typeof GrantRevocationChannel>;

const openChannels = new Set<GrantRevocationChannelInstance>();

afterEach(async () => {
	await Promise.all([...openChannels].map((channel) => channel.close()));
	openChannels.clear();
});

function createChannel(closeUser: (userId: string) => void): GrantRevocationChannelInstance {
	const messaging = resolveMcpCrossInstanceMessaging();
	if (!messaging) throw new Error('Redis messaging is unavailable.');
	const channel = new GrantRevocationChannel(closeUser, messaging);
	openChannels.add(channel);
	return channel;
}

async function waitForClosedUsers(closed: string[], expected: number): Promise<void> {
	const deadline = Date.now() + 5_000;
	while (closed.length < expected && Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}

describe('MCP grant revocation control channel', () => {
	it('delivers a revocation across real Redis instances', async () => {
		const closed: string[] = [];
		const subscriber = createChannel((userId) => closed.push(userId));
		const publisher = createChannel(() => {});
		await subscriber.start();

		await publisher.publish('user-revoked');
		await waitForClosedUsers(closed, 1);

		expect(closed).toEqual(['user-revoked']);
	});
});
