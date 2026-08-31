import { createMcpHandler } from '@modelcontextprotocol/server';
import type {
	AuthInfo,
	McpHandlerRequestOptions,
	McpHttpHandler,
} from '@modelcontextprotocol/server';

import { areResourceSubscriptionsAuthorized, createMcpServer } from '../server.js';
import type { McpRegistry } from '../scope-vocabulary.js';
import { getSupportedScopes } from '../supported-scopes.js';
import type { CrossInstanceMessaging } from '../oauth/index.js';
import { GrantRevocationChannel } from './grant-revocation-channel.js';
import { readMcpRequestAuthExtra } from './request-context.js';
import { createMcpProtocolErrorResponse } from './responses.js';
import { McpUserHandlerCache } from './user-handler-cache.js';
import { createUserServerEventBus } from './user-server-event-bus.js';

class McpPayloadTooLargeError extends Error {}

function boundRequestBody(request: Request, maximumBytes: number): Request {
	const declaredLength = request.headers.get('content-length');
	if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)) {
		throw new McpPayloadTooLargeError(`Request body exceeds the ${maximumBytes}-byte limit.`);
	}
	if (!request.body) return request;
	const reader = request.body.getReader();
	let receivedBytes = 0;
	const body = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						controller.close();
						return;
					}
					receivedBytes += value.byteLength;
					if (receivedBytes > maximumBytes) {
						const error = new McpPayloadTooLargeError(
							`Request body exceeded the ${maximumBytes}-byte limit while streaming.`,
						);
						controller.error(error);
						await reader.cancel(error).catch(() => {});
						return;
					}
					controller.enqueue(value);
				}
			} catch (error) {
				controller.error(error);
			}
		},
		cancel: (reason) => reader.cancel(reason),
	});
	return new Request(request.url, {
		method: request.method,
		headers: request.headers,
		body,
		duplex: 'half',
		signal: request.signal,
	} as RequestInit);
}

type ListenInspection = { isListenRequest: boolean; requestedResourceUris: string[] };

function readRequestedResourceUris(message: object): string[] {
	const parameters = (message as { params?: unknown }).params;
	if (typeof parameters !== 'object' || parameters === null) return [];
	const notifications = (parameters as { notifications?: unknown }).notifications;
	if (typeof notifications !== 'object' || notifications === null) return [];
	const uris = (notifications as { resourceSubscriptions?: unknown }).resourceSubscriptions;
	return Array.isArray(uris) ? uris.filter((uri): uri is string => typeof uri === 'string') : [];
}

async function inspectListenRequest(request: Request): Promise<ListenInspection> {
	const none = { isListenRequest: false, requestedResourceUris: [] };
	if (!request.body) return none;
	try {
		const parsed: unknown = await request.clone().json();
		const messages = Array.isArray(parsed) ? parsed : [parsed];
		const listens = messages.filter(
			(message): message is object =>
				typeof message === 'object' &&
				message !== null &&
				(message as { method?: unknown }).method === 'subscriptions/listen',
		);
		return listens.length === 0
			? none
			: {
					isListenRequest: true,
					requestedResourceUris: listens.flatMap(readRequestedResourceUris),
				};
	} catch {
		return none;
	}
}

export type McpHandlerConfiguration = {
	protocolVersion: string;
	maximumRequestBodyBytes: number;
	maximumSubscriptionsPerUser: number;
	userHandlerSweepIntervalMilliseconds: number;
	userHandlerIdleMilliseconds: number;
	enableUiExtension: boolean;
	enableConformanceMode: boolean;
};

export type McpHandlerSeams = {
	messaging?: CrossInstanceMessaging;
	markServerOnlyCloseableStream?(response: Response): Response;
	recordEvent(outcome: 'transport_failure' | 'insufficient_scope'): void;
	onError(error: unknown, operation: string, userId?: string): void;
};

export type McpServingHandler = {
	start(): Promise<void>;
	handle(request: Request, authInfo: AuthInfo): Promise<Response>;
	publishUserResourceUpdate(userId: string, uri: string): void;
	publishGrantRevocation(userId: string): Promise<void>;
	closeUser(userId: string): Promise<boolean>;
	shutdown(): Promise<void>;
};

export function createMcpServingHandler<Scope extends string>(input: {
	registry: McpRegistry<Scope>;
	configuration: McpHandlerConfiguration;
	seams: McpHandlerSeams;
}): McpServingHandler {
	const { registry, configuration, seams } = input;

	function createEntry(userId: string): {
		handler: McpHttpHandler;
		bus: ReturnType<typeof createUserServerEventBus>;
	} {
		const bus = createUserServerEventBus({
			userId,
			messaging: seams.messaging,
			onError: ({ error, operation }) => seams.onError(error, operation, userId),
		});
		const handler: McpHttpHandler = createMcpHandler(
			async (context) => {
				const extra = readMcpRequestAuthExtra(context.authInfo);
				if (!extra || extra.userId !== userId) {
					throw new Error('MCP request authenticated user does not match its routed handler.');
				}
				return createMcpServer(
					{
						userId,
						user: extra.userProfile,
						requestId: extra.requestId,
						enableUiExtension: configuration.enableUiExtension,
						enableConformanceMode: configuration.enableConformanceMode,
						era: context.era,
						publishResourceUpdate: async (uri) => handler.notify.resourceUpdated(uri),
						scopes: extra.scopes,
					},
					registry,
				);
			},
			{
				legacy: 'stateless',
				bus,
				maxSubscriptions: configuration.maximumSubscriptionsPerUser,
				onerror: (error) => {
					seams.recordEvent('transport_failure');
					seams.onError(error, 'transport', userId);
				},
			},
		);
		return { handler, bus };
	}

	const cache = new McpUserHandlerCache(createEntry, Date.now, ({ error, operation, userId }) =>
		seams.onError(error, operation, userId),
	);
	cache.startSweep(
		configuration.userHandlerSweepIntervalMilliseconds,
		configuration.userHandlerIdleMilliseconds,
	);
	const revocations = new GrantRevocationChannel(
		(userId) => cache.closeUser(userId),
		seams.messaging,
		(error, userId) => seams.onError(error, 'grant_revocation', userId),
	);

	return {
		start: () => revocations.start(),
		async handle(request, authInfo) {
			const options: McpHandlerRequestOptions = { authInfo };
			let boundedRequest: Request;
			try {
				boundedRequest = boundRequestBody(request, configuration.maximumRequestBodyBytes);
			} catch (error) {
				if (!(error instanceof McpPayloadTooLargeError)) throw error;
				return createMcpProtocolErrorResponse({
					status: 413,
					error: 'payload_too_large',
					errorDescription: error.message,
					headers: { 'MCP-Protocol-Version': configuration.protocolVersion },
				});
			}
			const extra = readMcpRequestAuthExtra(authInfo);
			if (!extra) throw new Error('MCP request reached the handler without verified auth context.');
			const inspection = await inspectListenRequest(boundedRequest);
			if (
				inspection.isListenRequest &&
				!areResourceSubscriptionsAuthorized(
					inspection.requestedResourceUris,
					extra.scopes,
					registry,
				)
			) {
				seams.recordEvent('insufficient_scope');
				return createMcpProtocolErrorResponse({
					status: 403,
					error: 'forbidden',
					errorDescription:
						'The access token does not carry the scopes required for the requested resource subscriptions.',
					headers: {
						'MCP-Protocol-Version': configuration.protocolVersion,
						'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${getSupportedScopes(registry).join(' ')}"`,
					},
				});
			}
			const response = await cache.get(extra.userId).handler.fetch(boundedRequest, options);
			return inspection.isListenRequest
				? (seams.markServerOnlyCloseableStream?.(response) ?? response)
				: response;
		},
		publishUserResourceUpdate(userId, uri) {
			const existing = cache.peek(userId);
			if (existing) {
				existing.handler.notify.resourceUpdated(uri);
				return;
			}
			if (seams.messaging) {
				createUserServerEventBus({ userId, messaging: seams.messaging }).publish({
					kind: 'resource_updated',
					uri,
				});
			}
		},
		publishGrantRevocation: (userId) => revocations.publish(userId),
		closeUser: (userId) => cache.closeUser(userId),
		async shutdown() {
			await revocations.close();
			await cache.closeAll();
		},
	};
}
