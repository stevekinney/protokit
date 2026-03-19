import { getRedisClient } from '@web/lib/redis-client';

const SESSION_KEY_PREFIX = 'mcp_session';

export type McpSessionRecord = {
	sessionId: string;
	userId: string;
	ownerInstanceId: string;
	lastActivityAt: string;
	expiresAt: string;
};

function getSessionKey(sessionId: string): string {
	return `${SESSION_KEY_PREFIX}:${sessionId}`;
}

function parseSessionRecord(value: string | null): McpSessionRecord | null {
	if (!value) return null;

	try {
		const parsed = JSON.parse(value) as McpSessionRecord;
		if (!parsed.sessionId || !parsed.userId || !parsed.ownerInstanceId) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

export class McpSessionStore {
	async createSession(input: {
		sessionId: string;
		userId: string;
		ownerInstanceId: string;
		timeToLiveSeconds: number;
	}): Promise<McpSessionRecord> {
		const now = new Date();
		const expiresAt = new Date(Date.now() + input.timeToLiveSeconds * 1000);
		const record: McpSessionRecord = {
			sessionId: input.sessionId,
			userId: input.userId,
			ownerInstanceId: input.ownerInstanceId,
			lastActivityAt: now.toISOString(),
			expiresAt: expiresAt.toISOString(),
		};

		const redisClient = await getRedisClient();
		await redisClient.set(getSessionKey(input.sessionId), JSON.stringify(record), {
			EX: input.timeToLiveSeconds,
		});

		return record;
	}

	async getSession(sessionId: string): Promise<McpSessionRecord | null> {
		const redisClient = await getRedisClient();
		const value = await redisClient.get(getSessionKey(sessionId));
		return parseSessionRecord(value);
	}

	async touchSession(
		sessionId: string,
		timeToLiveSeconds: number,
	): Promise<McpSessionRecord | null> {
		const record = await this.getSession(sessionId);
		if (!record) return null;

		const now = new Date();
		const updatedRecord: McpSessionRecord = {
			...record,
			lastActivityAt: now.toISOString(),
			expiresAt: new Date(now.getTime() + timeToLiveSeconds * 1000).toISOString(),
		};

		const redisClient = await getRedisClient();
		await redisClient.set(getSessionKey(sessionId), JSON.stringify(updatedRecord), {
			EX: timeToLiveSeconds,
		});

		return updatedRecord;
	}

	async deleteSession(sessionId: string): Promise<void> {
		const redisClient = await getRedisClient();
		await redisClient.del(getSessionKey(sessionId));
	}
}

export const mcpSessionStore = new McpSessionStore();
