import type { AuthInfo } from '@modelcontextprotocol/server';

import { resolveOauthNetworkIdentity, type OAuthRequestContext } from '../oauth/index.js';
import type { McpConcurrencyLimiter, RequestRateLimiter } from '../rate-limit/index.js';
import { attachConcurrencySlotToResponseLifetime } from '../rate-limit/index.js';
import {
	authenticateMcpUser,
	type McpAuthenticationConfiguration,
	type McpAuthenticationSeams,
} from './authenticate.js';
import type { McpServingHandler } from './handler.js';
import { inspectListenRequest } from './listen-inspection.js';
import { readMcpRequestAuthExtra } from './request-context.js';
import {
	createMcpCorsHeaders,
	createMcpProtocolErrorResponse,
	createRateLimitedResponse,
} from './responses.js';

export type McpHttpServingLayer = {
	handle(context: OAuthRequestContext): Promise<Response>;
};

/**
 * Owns the full `/mcp` order: network admission, authentication, auth-extra
 * validation, per-user admission, concurrency acquisition, then dispatch.
 */
export function createMcpHttpServingLayer(input: {
	authenticationConfiguration: McpAuthenticationConfiguration;
	authenticationSeams: McpAuthenticationSeams;
	rateLimiter: Pick<RequestRateLimiter, 'consume'>;
	concurrencyLimiter: Pick<McpConcurrencyLimiter, 'acquire'>;
	handler: Pick<McpServingHandler, 'handle'>;
	/**
	 * Applied to the FINAL response for a `subscriptions/listen` request so a
	 * graceful-shutdown drain can exclude it. Provided here (not read off the
	 * handler) because this layer owns the response after its CORS and
	 * concurrency re-wraps, which replace the object the handler could tag.
	 */
	markServerOnlyCloseableStream?: (response: Response) => Response;
}): McpHttpServingLayer {
	return {
		async handle(context) {
			const networkIdentity = resolveOauthNetworkIdentity({
				socketAddress: context.socketAddress,
				headers: context.request.headers,
				configuration: input.authenticationConfiguration.trustedProxy,
			});
			const resolvedContext = { ...context, socketAddress: networkIdentity };
			const corsHeaders = createMcpCorsHeaders(
				context.request,
				input.authenticationConfiguration.allowedOrigins,
			);
			const protocolHeaders = {
				...corsHeaders,
				'MCP-Protocol-Version': input.authenticationConfiguration.protocolVersion,
			};
			if (context.request.method !== 'OPTIONS') {
				const networkAdmission = await input.rateLimiter.consume('mcp_network', networkIdentity);
				if (!networkAdmission.allowed) {
					return createRateLimitedResponse(networkAdmission.retryAfterSeconds, protocolHeaders);
				}
			}
			const authentication = await authenticateMcpUser({
				context: resolvedContext,
				configuration: input.authenticationConfiguration,
				seams: input.authenticationSeams,
			});
			if (authentication instanceof Response) return authentication;
			const extra = readMcpRequestAuthExtra(authentication);
			if (!extra) {
				return createMcpProtocolErrorResponse({
					status: 401,
					error: 'unauthorized',
					errorDescription: 'Invalid or expired token.',
					headers: protocolHeaders,
				});
			}
			const userAdmission = await input.rateLimiter.consume('mcp_user', extra.userId);
			if (!userAdmission.allowed) {
				return createRateLimitedResponse(userAdmission.retryAfterSeconds, protocolHeaders);
			}
			const concurrencySlot = await input.concurrencyLimiter.acquire(
				`rate_limit:mcp_concurrent:${extra.userId}`,
			);
			if (!concurrencySlot.allowed) {
				return createMcpProtocolErrorResponse({
					status: 429,
					error: 'rate_limited',
					errorDescription: 'Too many concurrent MCP requests for this user.',
					headers: protocolHeaders,
				});
			}
			try {
				// A cheap tee taken before dispatch; only parsed below if the response is a
				// stream, so ordinary request/response calls never parse it twice. Kept inside
				// the try so a failed clone still releases the concurrency slot.
				const listenProbe = input.markServerOnlyCloseableStream
					? context.request.clone()
					: undefined;
				const response = await input.handler.handle(context.request, authentication as AuthInfo);
				const headers = new Headers(response.headers);
				for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
				const responseWithCorsHeaders = new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers,
				});
				const settled = attachConcurrencySlotToResponseLifetime(
					responseWithCorsHeaders,
					concurrencySlot,
				);
				// The handler tags its own response for direct callers, but this layer
				// rebuilt the Response and its body twice above; apply the seam to the
				// object this layer actually returns. Gate the request re-parse on the
				// response being an event stream so only listen responses pay for it.
				if (
					listenProbe &&
					(settled.headers.get('content-type') ?? '').includes('text/event-stream') &&
					(await inspectListenRequest(listenProbe)).isListenRequest
				) {
					return input.markServerOnlyCloseableStream?.(settled) ?? settled;
				}
				return settled;
			} catch (error) {
				await concurrencySlot.release();
				throw error;
			}
		},
	};
}
