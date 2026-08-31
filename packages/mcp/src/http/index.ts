import * as authorizationHeaderModule from './authorization-header.js';
import * as grantRevocationModule from './grant-revocation-channel.js';
import * as handlerModule from './handler.js';
import * as requestContextModule from './request-context.js';
import * as responsesModule from './responses.js';
import * as servingLayerModule from './serving-layer.js';
import * as userHandlerCacheModule from './user-handler-cache.js';
import * as userServerEventBusModule from './user-server-event-bus.js';

export const parseAuthorizationHeader = authorizationHeaderModule.parseAuthorizationHeader;
export const GrantRevocationChannel = grantRevocationModule.GrantRevocationChannel;
export const createMcpServingHandler = handlerModule.createMcpServingHandler;
export const buildMcpAuthInfo = requestContextModule.buildMcpAuthInfo;
export const readMcpRequestAuthExtra = requestContextModule.readMcpRequestAuthExtra;
export const createMcpCorsHeaders = responsesModule.createMcpCorsHeaders;
export const createMcpProtocolErrorResponse = responsesModule.createMcpProtocolErrorResponse;
export const isMcpOriginAllowed = responsesModule.isMcpOriginAllowed;
export const createMcpHttpServingLayer = servingLayerModule.createMcpHttpServingLayer;
export const McpUserHandlerCache = userHandlerCacheModule.McpUserHandlerCache;
export const createUserServerEventBus = userServerEventBusModule.createUserServerEventBus;
export const CrossInstanceUserServerEventBus =
	userServerEventBusModule.CrossInstanceUserServerEventBus;

export type {
	McpAuthenticationConfiguration,
	McpAuthenticationOutcome,
	McpAuthenticationSeams,
} from './authenticate.js';
export type { GrantRevocationRetryConfiguration } from './grant-revocation-channel.js';
export type { McpHandlerConfiguration, McpHandlerSeams, McpServingHandler } from './handler.js';
export type { McpRequestAuthExtra } from './request-context.js';
export type { McpHttpServingLayer } from './serving-layer.js';
export type { McpHandlerLifecycleError, McpUserHandlerEntry } from './user-handler-cache.js';
export type { McpMessagingError, UserServerEventBus } from './user-server-event-bus.js';
