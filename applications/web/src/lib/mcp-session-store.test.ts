import { beforeEach, describe, expect, it, vi } from 'vitest';

const redisValues = new Map<string, string>();

vi.mock('$lib/redis-client', () => {
	return {
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

const { McpSessionStore } = await import('$lib/mcp-session-store');

describe('McpSessionStore', () => {
	beforeEach(() => {
		redisValues.clear();
	});

	it('creates and retrieves a session record', async () => {
		const sessionStore = new McpSessionStore();
		await sessionStore.createSession({
			sessionId: 'session-1',
			userId: 'user-1',
			ownerInstanceId: 'instance-1',
			timeToLiveSeconds: 1800,
		});

		const loaded = await sessionStore.getSession('session-1');
		expect(loaded?.sessionId).toBe('session-1');
		expect(loaded?.userId).toBe('user-1');
		expect(loaded?.ownerInstanceId).toBe('instance-1');
	});

	it('touches an existing session', async () => {
		const sessionStore = new McpSessionStore();
		const created = await sessionStore.createSession({
			sessionId: 'session-2',
			userId: 'user-2',
			ownerInstanceId: 'instance-2',
			timeToLiveSeconds: 1800,
		});

		const touched = await sessionStore.touchSession('session-2', 1800);
		expect(touched).not.toBeNull();
		expect(new Date(touched!.lastActivityAt).getTime()).toBeGreaterThanOrEqual(
			new Date(created.lastActivityAt).getTime(),
		);
	});

	it('deletes a session record', async () => {
		const sessionStore = new McpSessionStore();
		await sessionStore.createSession({
			sessionId: 'session-3',
			userId: 'user-3',
			ownerInstanceId: 'instance-3',
			timeToLiveSeconds: 1800,
		});

		await sessionStore.deleteSession('session-3');
		const loaded = await sessionStore.getSession('session-3');
		expect(loaded).toBeNull();
	});
});
