import type { McpSessionRecord } from '@web/lib/mcp-session-store';

type StoredEntry = {
	record: McpSessionRecord;
	expiresAt: number;
};

const sessions = new Map<string, StoredEntry>();

function pruneExpired(sessionId: string): McpSessionRecord | null {
	const entry = sessions.get(sessionId);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		sessions.delete(sessionId);
		return null;
	}
	return entry.record;
}

export class InMemoryMcpSessionStore {
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

		sessions.set(input.sessionId, {
			record,
			expiresAt: expiresAt.getTime(),
		});

		return record;
	}

	async getSession(sessionId: string): Promise<McpSessionRecord | null> {
		return pruneExpired(sessionId);
	}

	async touchSession(
		sessionId: string,
		timeToLiveSeconds: number,
	): Promise<McpSessionRecord | null> {
		const record = pruneExpired(sessionId);
		if (!record) return null;

		const now = new Date();
		const newExpiresAt = new Date(now.getTime() + timeToLiveSeconds * 1000);
		const updatedRecord: McpSessionRecord = {
			...record,
			lastActivityAt: now.toISOString(),
			expiresAt: newExpiresAt.toISOString(),
		};

		sessions.set(sessionId, {
			record: updatedRecord,
			expiresAt: newExpiresAt.getTime(),
		});

		return updatedRecord;
	}

	async deleteSession(sessionId: string): Promise<void> {
		sessions.delete(sessionId);
	}
}
