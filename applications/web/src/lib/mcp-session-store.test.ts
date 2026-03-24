import { beforeEach, describe, expect, it, mock } from 'bun:test';

const redisValues = new Map<string, string>();

mock.module('@web/lib/redis-client', () => {
	return {
		isRedisConfigured: () => true,
		getRedisClient: async () => ({
			set: async (key: string, value: string) => {
				redisValues.set(key, value);
			},
			get: async (key: string) => redisValues.get(key) ?? null,
			del: async (key: string) => {
				redisValues.delete(key);
			},
		}),
	};
});

mock.module('@template/mcp/logger', () => ({
	logger: {
		warn: () => {},
		info: () => {},
		error: () => {},
		child: () => ({ warn: () => {}, info: () => {}, error: () => {} }),
	},
}));

const { mcpSessionStore } = await import('@web/lib/mcp-session-store');

describe('McpSessionStore', () => {
	beforeEach(() => {
		redisValues.clear();
	});

	it('creates and retrieves a session record', async () => {
		await mcpSessionStore.createSession({
			sessionId: 'session-1',
			userId: 'user-1',
			ownerInstanceId: 'instance-1',
			timeToLiveSeconds: 1800,
		});

		const loaded = await mcpSessionStore.getSession('session-1');
		expect(loaded?.sessionId).toBe('session-1');
		expect(loaded?.userId).toBe('user-1');
		expect(loaded?.ownerInstanceId).toBe('instance-1');
	});

	it('touches an existing session', async () => {
		const created = await mcpSessionStore.createSession({
			sessionId: 'session-2',
			userId: 'user-2',
			ownerInstanceId: 'instance-2',
			timeToLiveSeconds: 1800,
		});

		const touched = await mcpSessionStore.touchSession('session-2', 1800);
		expect(touched).not.toBeNull();
		expect(new Date(touched!.lastActivityAt).getTime()).toBeGreaterThanOrEqual(
			new Date(created.lastActivityAt).getTime(),
		);
	});

	it('deletes a session record', async () => {
		await mcpSessionStore.createSession({
			sessionId: 'session-3',
			userId: 'user-3',
			ownerInstanceId: 'instance-3',
			timeToLiveSeconds: 1800,
		});

		await mcpSessionStore.deleteSession('session-3');
		const loaded = await mcpSessionStore.getSession('session-3');
		expect(loaded).toBeNull();
	});
});
