import { randomUUID } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '@template/mcp';
import { logger } from '@template/mcp/logger';
import { database, schema } from '@template/database';
import { eq, and } from 'drizzle-orm';

const MAX_ACTIVE_SESSIONS = 1000;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVICTION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const activeTransports = new Map<
	string,
	{ transport: WebStandardStreamableHTTPServerTransport; userId: string; lastActivity: number }
>();

setInterval(() => {
	const now = Date.now();
	for (const [sessionId, entry] of activeTransports) {
		if (now - entry.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
			logger.info({ sessionId, userId: entry.userId }, 'Evicting idle MCP session');
			entry.transport.close().catch(() => {});
			activeTransports.delete(sessionId);
		}
	}
}, EVICTION_INTERVAL_MS);

async function verifySessionOwnership(
	sessionId: string,
	userId: string,
): Promise<WebStandardStreamableHTTPServerTransport | null> {
	const entry = activeTransports.get(sessionId);
	if (!entry) return null;
	if (entry.userId !== userId) return null;
	entry.lastActivity = Date.now();
	return entry.transport;
}

export async function handleMcpRequest(request: Request, userId: string): Promise<Response> {
	const requestLogger = logger.child({ component: 'mcp-handler', userId });

	if (request.method === 'GET' || request.method === 'DELETE') {
		const sessionId = request.headers.get('mcp-session-id');
		if (!sessionId) {
			return new Response(JSON.stringify({ error: 'Missing mcp-session-id header' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const transport = await verifySessionOwnership(sessionId, userId);
		if (!transport) {
			return new Response(JSON.stringify({ error: 'Session not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		if (request.method === 'DELETE') {
			requestLogger.info({ sessionId }, 'Closing MCP session');
			await transport.close();
			activeTransports.delete(sessionId);
			await database
				.update(schema.mcpSessions)
				.set({ lastActiveAt: new Date() })
				.where(
					and(eq(schema.mcpSessions.sessionId, sessionId), eq(schema.mcpSessions.userId, userId)),
				);
			return new Response(null, { status: 204 });
		}

		return transport.handleRequest(request);
	}

	if (request.method === 'POST') {
		const sessionId = request.headers.get('mcp-session-id');

		if (sessionId) {
			const transport = await verifySessionOwnership(sessionId, userId);
			if (!transport) {
				return new Response(JSON.stringify({ error: 'Session not found' }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' },
				});
			}

			await database
				.update(schema.mcpSessions)
				.set({ lastActiveAt: new Date() })
				.where(
					and(eq(schema.mcpSessions.sessionId, sessionId), eq(schema.mcpSessions.userId, userId)),
				);

			return transport.handleRequest(request);
		}

		// Enforce max session limit
		if (activeTransports.size >= MAX_ACTIVE_SESSIONS) {
			requestLogger.warn({ activeCount: activeTransports.size }, 'Max active sessions reached');
			return new Response(JSON.stringify({ error: 'Too many active sessions' }), {
				status: 503,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const newSessionId = randomUUID();
		requestLogger.info({ sessionId: newSessionId }, 'Creating new MCP session');

		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: () => newSessionId,
		});

		const server = createMcpServer({ userId });

		transport.onclose = () => {
			requestLogger.info({ sessionId: newSessionId }, 'Transport closed');
			activeTransports.delete(newSessionId);
		};

		activeTransports.set(newSessionId, { transport, userId, lastActivity: Date.now() });

		await database.insert(schema.mcpSessions).values({
			sessionId: newSessionId,
			userId,
			createdAt: new Date(),
			lastActiveAt: new Date(),
		});

		await server.connect(transport);
		return transport.handleRequest(request);
	}

	return new Response(JSON.stringify({ error: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' },
	});
}
