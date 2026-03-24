import { randomUUID } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { isInitializeRequest, JSONRPCMessageSchema } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpServer } from '@template/mcp';
import type { McpUserProfile } from '@template/mcp';
import { logger } from '@template/mcp/logger';
import { metricsCollector } from '@template/mcp/metrics';
import { database, schema } from '@template/database';
import { eq, and } from 'drizzle-orm';
import { mcpSessionStore } from '@web/lib/mcp-session-store';
import { instanceIdentifier } from '@web/lib/instance-identifier';
import { environment } from '@web/env';
import { createMcpProtocolErrorResponse } from '@web/lib/mcp-protocol-error-response';
import { createMcpCorsHeaders, validateMcpRequestOrigin } from '@web/lib/mcp-origin-validation';
import { mcpProtocolVersion } from '@web/lib/mcp-protocol-constants';
import { resourceSubscriptionManager } from '@web/lib/resource-subscription-manager';
import { disconnectRedisSubscriberClient } from '@web/lib/redis-client';

const MAX_ACTIVE_SESSIONS = 1000;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVICTION_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_TIME_TO_LIVE_SECONDS = Math.floor(SESSION_IDLE_TIMEOUT_MS / 1000);

type ActiveTransportEntry = {
	transport: WebStandardStreamableHTTPServerTransport;
	server: McpServer;
	userId: string;
	lastActivity: number;
};

const activeTransports = new Map<string, ActiveTransportEntry>();

resourceSubscriptionManager.onResourceUpdated((uri) => {
	for (const [, entry] of activeTransports) {
		entry.server.server.sendResourceUpdated({ uri }).catch(() => {});
	}
});

type ParsedMcpPostBody = {
	parsedBody: unknown;
	isInitializationRequest: boolean;
};

function buildMcpResponseHeaders(request: Request): Record<string, string> {
	return {
		...createMcpCorsHeaders(request),
		'MCP-Protocol-Version': mcpProtocolVersion,
	};
}

function buildSessionAffinityRequiredResponse(
	sessionId: string,
	headers: Record<string, string>,
): Response {
	return new Response(
		JSON.stringify({
			error: 'session_affinity_required',
			error_description:
				'This MCP session is owned by a different application instance. Reconnect to establish a new session.',
			action: 'reconnect',
			session_id: sessionId,
			status: 409,
		}),
		{
			status: 409,
			headers: {
				'Content-Type': 'application/json',
				...headers,
			},
		},
	);
}

function buildSessionNotFoundResponse(headers: Record<string, string>): Response {
	return createMcpProtocolErrorResponse({
		status: 404,
		error: 'not_found',
		errorDescription: 'Session not found',
		headers,
	});
}

async function parseAndValidatePostBody(
	request: Request,
	headers: Record<string, string>,
): Promise<ParsedMcpPostBody | Response> {
	const acceptHeader = request.headers.get('accept') ?? '';
	if (!acceptHeader.includes('application/json') || !acceptHeader.includes('text/event-stream')) {
		return createMcpProtocolErrorResponse({
			status: 406,
			error: 'not_acceptable',
			errorDescription:
				'POST /mcp requires Accept to include both application/json and text/event-stream.',
			headers,
		});
	}

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		return createMcpProtocolErrorResponse({
			status: 415,
			error: 'unsupported_media_type',
			errorDescription: 'POST /mcp requires Content-Type: application/json.',
			headers,
		});
	}

	let rawBody: unknown;
	try {
		rawBody = await request.json();
	} catch {
		return createMcpProtocolErrorResponse({
			status: 400,
			error: 'bad_request',
			errorDescription: 'Invalid JSON body.',
			headers,
		});
	}

	const messages = Array.isArray(rawBody) ? rawBody : [rawBody];
	try {
		for (const message of messages) {
			JSONRPCMessageSchema.parse(message);
		}
	} catch {
		return createMcpProtocolErrorResponse({
			status: 400,
			error: 'bad_request',
			errorDescription: 'Invalid JSON-RPC message payload.',
			headers,
		});
	}

	const isInitializationRequest = messages.some((message) => isInitializeRequest(message));
	if (isInitializationRequest) {
		const initializationMessage = messages.find((message) => isInitializeRequest(message));
		const requestedProtocolVersion = initializationMessage?.params?.protocolVersion;
		if (requestedProtocolVersion !== mcpProtocolVersion) {
			return createMcpProtocolErrorResponse({
				status: 400,
				error: 'bad_request',
				errorDescription: `Only MCP protocol version ${mcpProtocolVersion} is supported.`,
				headers,
			});
		}
	}

	return { parsedBody: rawBody, isInitializationRequest };
}

function validateVersionAndAcceptHeadersForSessionBoundRequests(
	request: Request,
	headers: Record<string, string>,
): Response | null {
	const protocolHeader = request.headers.get('mcp-protocol-version');
	if (protocolHeader !== mcpProtocolVersion) {
		return createMcpProtocolErrorResponse({
			status: 400,
			error: 'bad_request',
			errorDescription: `MCP-Protocol-Version must be ${mcpProtocolVersion} for established sessions.`,
			headers,
		});
	}

	if (request.method === 'GET') {
		const acceptHeader = request.headers.get('accept') ?? '';
		if (!acceptHeader.includes('text/event-stream')) {
			return createMcpProtocolErrorResponse({
				status: 406,
				error: 'not_acceptable',
				errorDescription: 'GET /mcp requires Accept: text/event-stream.',
				headers,
			});
		}
	}

	return null;
}

function attachCommonMcpResponseHeaders(
	response: Response,
	headers: Record<string, string>,
): Response {
	for (const [key, value] of Object.entries(headers)) {
		response.headers.set(key, value);
	}
	return response;
}

async function verifySessionOwnership(input: {
	sessionId: string;
	userId: string;
}): Promise<
	| { status: 'ok'; transport: WebStandardStreamableHTTPServerTransport }
	| { status: 'not_found' | 'session_affinity_required' }
> {
	const storedSession = await mcpSessionStore.getSession(input.sessionId);
	if (!storedSession || storedSession.userId !== input.userId) {
		return { status: 'not_found' };
	}

	if (storedSession.ownerInstanceId !== instanceIdentifier) {
		return { status: 'session_affinity_required' };
	}

	const activeTransportEntry = activeTransports.get(input.sessionId);
	if (!activeTransportEntry || activeTransportEntry.userId !== input.userId) {
		return { status: 'session_affinity_required' };
	}

	activeTransportEntry.lastActivity = Date.now();
	await mcpSessionStore.touchSession(input.sessionId, SESSION_TIME_TO_LIVE_SECONDS);

	return { status: 'ok', transport: activeTransportEntry.transport };
}

const evictionInterval = setInterval(() => {
	const now = Date.now();
	for (const [sessionId, entry] of activeTransports) {
		if (now - entry.lastActivity > SESSION_IDLE_TIMEOUT_MS) {
			logger.info({ sessionId, userId: entry.userId }, 'Evicting idle MCP session');
			entry.transport.close().catch(() => {});
			activeTransports.delete(sessionId);
			metricsCollector.decrementActiveSessions();
			void resourceSubscriptionManager.unsubscribeAll(sessionId);
			void mcpSessionStore.deleteSession(sessionId);
		}
	}
}, EVICTION_INTERVAL_MS);

export async function shutdownMcpTransports(): Promise<void> {
	clearInterval(evictionInterval);
	const closePromises: Promise<void>[] = [];
	for (const [sessionId, entry] of activeTransports) {
		logger.info({ sessionId, userId: entry.userId }, 'Closing MCP session for shutdown');
		closePromises.push(entry.transport.close().catch(() => {}));
		closePromises.push(resourceSubscriptionManager.unsubscribeAll(sessionId).catch(() => {}));
	}
	await Promise.allSettled(closePromises);
	activeTransports.clear();
	await disconnectRedisSubscriberClient().catch(() => {});
}

async function fetchUserProfile(userId: string): Promise<McpUserProfile | null> {
	const [user] = await database
		.select({
			id: schema.users.id,
			email: schema.users.email,
			name: schema.users.name,
			image: schema.users.image,
			role: schema.users.role,
		})
		.from(schema.users)
		.where(eq(schema.users.id, userId))
		.limit(1);

	return user ?? null;
}

export async function handleMcpRequest(request: Request, userId: string): Promise<Response> {
	const requestLogger = logger.child({ component: 'mcp-handler', userId, instanceIdentifier });
	const responseHeaders = buildMcpResponseHeaders(request);
	const originValidation = validateMcpRequestOrigin(request);
	if (!originValidation.allowed) {
		return createMcpProtocolErrorResponse({
			status: 403,
			error: 'forbidden',
			errorDescription: 'Origin is not allowed for MCP requests.',
			headers: responseHeaders,
		});
	}

	if (request.method === 'GET' || request.method === 'DELETE') {
		const sessionId = request.headers.get('mcp-session-id');
		if (!sessionId) {
			return createMcpProtocolErrorResponse({
				status: 400,
				error: 'bad_request',
				errorDescription: 'Missing mcp-session-id header.',
				headers: responseHeaders,
			});
		}
		const protocolValidationError = validateVersionAndAcceptHeadersForSessionBoundRequests(
			request,
			responseHeaders,
		);
		if (protocolValidationError) {
			return protocolValidationError;
		}

		const verification = await verifySessionOwnership({ sessionId, userId });
		if (verification.status !== 'ok') {
			if (verification.status === 'not_found') {
				return buildSessionNotFoundResponse(responseHeaders);
			}
			return buildSessionAffinityRequiredResponse(sessionId, responseHeaders);
		}
		const { transport } = verification;

		if (request.method === 'DELETE') {
			requestLogger.info({ sessionId }, 'Closing MCP session');
			await transport.close();
			activeTransports.delete(sessionId);
			metricsCollector.decrementActiveSessions();
			await resourceSubscriptionManager.unsubscribeAll(sessionId);
			await mcpSessionStore.deleteSession(sessionId);
			await database
				.update(schema.mcpSessions)
				.set({ lastActiveAt: new Date() })
				.where(
					and(eq(schema.mcpSessions.sessionId, sessionId), eq(schema.mcpSessions.userId, userId)),
				);
			return attachCommonMcpResponseHeaders(new Response(null, { status: 204 }), responseHeaders);
		}

		return attachCommonMcpResponseHeaders(await transport.handleRequest(request), responseHeaders);
	}

	if (request.method === 'POST') {
		const postPayload = await parseAndValidatePostBody(request, responseHeaders);
		if (postPayload instanceof Response) {
			return postPayload;
		}

		const sessionId = request.headers.get('mcp-session-id');

		if (sessionId) {
			const protocolValidationError = validateVersionAndAcceptHeadersForSessionBoundRequests(
				request,
				responseHeaders,
			);
			if (protocolValidationError) {
				return protocolValidationError;
			}

			const verification = await verifySessionOwnership({ sessionId, userId });
			if (verification.status !== 'ok') {
				if (verification.status === 'not_found') {
					return buildSessionNotFoundResponse(responseHeaders);
				}
				return buildSessionAffinityRequiredResponse(sessionId, responseHeaders);
			}
			const { transport } = verification;

			await database
				.update(schema.mcpSessions)
				.set({ lastActiveAt: new Date() })
				.where(
					and(eq(schema.mcpSessions.sessionId, sessionId), eq(schema.mcpSessions.userId, userId)),
				);

			return attachCommonMcpResponseHeaders(
				await transport.handleRequest(request, { parsedBody: postPayload.parsedBody }),
				responseHeaders,
			);
		}

		// Stateless mode fallback for non-session requests that are not initialization.
		if (!postPayload.isInitializationRequest) {
			const protocolHeader = request.headers.get('mcp-protocol-version');
			if (protocolHeader !== mcpProtocolVersion) {
				return createMcpProtocolErrorResponse({
					status: 400,
					error: 'bad_request',
					errorDescription: `MCP-Protocol-Version must be ${mcpProtocolVersion} when no session is used.`,
					headers: responseHeaders,
				});
			}

			const statelessUser = await fetchUserProfile(userId);
			if (!statelessUser) {
				return createMcpProtocolErrorResponse({
					status: 401,
					error: 'unauthorized',
					errorDescription: 'User not found.',
					headers: responseHeaders,
				});
			}

			const statelessTransport = new WebStandardStreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true,
			});
			const statelessServer = createMcpServer({
				userId,
				user: statelessUser,
				enableUiExtension: environment.MCP_ENABLE_UI_EXTENSION,
				enableClientCredentialsExtension: environment.MCP_ENABLE_CLIENT_CREDENTIALS,
				enableEnterpriseAuthorizationExtension: environment.MCP_ENABLE_ENTERPRISE_AUTH,
				enableConformanceMode: environment.MCP_CONFORMANCE_MODE,
				subscriptionBackend: resourceSubscriptionManager,
			});
			await statelessServer.connect(statelessTransport);
			try {
				return attachCommonMcpResponseHeaders(
					await statelessTransport.handleRequest(request, {
						parsedBody: postPayload.parsedBody,
					}),
					responseHeaders,
				);
			} finally {
				await statelessTransport.close().catch(() => {});
				await statelessServer.close().catch(() => {});
			}
		}

		if (activeTransports.size >= MAX_ACTIVE_SESSIONS) {
			requestLogger.warn({ activeCount: activeTransports.size }, 'Max active sessions reached');
			return createMcpProtocolErrorResponse({
				status: 503,
				error: 'internal_error',
				errorDescription: 'Too many active sessions.',
				headers: {
					...responseHeaders,
					'Retry-After': '30',
				},
			});
		}

		const sessionUser = await fetchUserProfile(userId);
		if (!sessionUser) {
			return createMcpProtocolErrorResponse({
				status: 401,
				error: 'unauthorized',
				errorDescription: 'User not found.',
				headers: responseHeaders,
			});
		}

		const newSessionId = randomUUID();
		requestLogger.info({ sessionId: newSessionId }, 'Creating new MCP session');

		const transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: () => newSessionId,
		});

		const server = createMcpServer({
			userId,
			user: sessionUser,
			enableUiExtension: environment.MCP_ENABLE_UI_EXTENSION,
			enableClientCredentialsExtension: environment.MCP_ENABLE_CLIENT_CREDENTIALS,
			enableEnterpriseAuthorizationExtension: environment.MCP_ENABLE_ENTERPRISE_AUTH,
			enableConformanceMode: environment.MCP_CONFORMANCE_MODE,
			subscriptionBackend: resourceSubscriptionManager,
		});

		transport.onclose = () => {
			requestLogger.info({ sessionId: newSessionId }, 'Transport closed');
			activeTransports.delete(newSessionId);
			metricsCollector.decrementActiveSessions();
			void resourceSubscriptionManager.unsubscribeAll(newSessionId);
			void mcpSessionStore.deleteSession(newSessionId);
		};

		activeTransports.set(newSessionId, { transport, server, userId, lastActivity: Date.now() });
		metricsCollector.incrementActiveSessions();

		await mcpSessionStore.createSession({
			sessionId: newSessionId,
			userId,
			ownerInstanceId: instanceIdentifier,
			timeToLiveSeconds: SESSION_TIME_TO_LIVE_SECONDS,
		});

		await database.insert(schema.mcpSessions).values({
			sessionId: newSessionId,
			userId,
			createdAt: new Date(),
			lastActiveAt: new Date(),
		});

		await server.connect(transport);
		return attachCommonMcpResponseHeaders(
			await transport.handleRequest(request, { parsedBody: postPayload.parsedBody }),
			responseHeaders,
		);
	}

	return createMcpProtocolErrorResponse({
		status: 405,
		error: 'bad_request',
		errorDescription: 'Method not allowed.',
		headers: responseHeaders,
	});
}
