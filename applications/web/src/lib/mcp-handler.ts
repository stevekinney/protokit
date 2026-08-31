import type { AuthInfo } from '@modelcontextprotocol/server';
import { templateRegistry } from '@lostgradient/mcp';
import { createMcpServingHandler } from '@lostgradient/mcp/http';
import { logger } from '@lostgradient/mcp/logger';
import { metricsCollector } from '@lostgradient/mcp/metrics';
import { environment } from '@web/env';
import { resolveMcpCrossInstanceMessaging } from '@web/lib/mcp-cross-instance-messaging';
import { markAsServerOnlyCloseableStream } from '@web/lib/in-flight-request-tracker';
import { mcpLatestProtocolVersion } from '@web/lib/mcp-protocol-constants';
import { disconnectRedisSubscriberClient } from '@web/lib/redis-client';
import {
	mcpMaxSubscriptionsPerUserHandler,
	mcpRequestMaxBodyBytes,
	mcpUserHandlerIdleMs,
	mcpUserHandlerSweepIntervalMs,
} from '@web/lib/request-limits';

export function shouldEnableConformanceMode(input: {
	conformanceModeConfigured: boolean;
	tunnelActive: boolean;
}): boolean {
	return input.conformanceModeConfigured && !input.tunnelActive;
}

const servingHandler = createMcpServingHandler({
	registry: templateRegistry,
	configuration: {
		protocolVersion: mcpLatestProtocolVersion,
		maximumRequestBodyBytes: mcpRequestMaxBodyBytes,
		maximumSubscriptionsPerUser: mcpMaxSubscriptionsPerUserHandler,
		userHandlerSweepIntervalMilliseconds: mcpUserHandlerSweepIntervalMs,
		userHandlerIdleMilliseconds: mcpUserHandlerIdleMs,
		enableUiExtension: environment.mcpEnableUiExtension,
		enableConformanceMode: shouldEnableConformanceMode({
			conformanceModeConfigured: environment.mcpConformanceMode,
			tunnelActive: environment.protokitTunnelActive,
		}),
	},
	seams: {
		messaging: resolveMcpCrossInstanceMessaging(),
		markServerOnlyCloseableStream: markAsServerOnlyCloseableStream,
		reportDegradation: (degradation) =>
			logger.warn({ degradation }, 'MCP serving layer is running with reduced capabilities'),
		recordEvent: (outcome) => metricsCollector.recordEvent('mcp_method', outcome),
		onError: (error, operation, userId) =>
			logger.error({ err: error, operation, userId }, 'MCP serving-layer operation failed'),
	},
});

const startup = servingHandler.start();

export async function handleMcpRequest(request: Request, authInfo: AuthInfo): Promise<Response> {
	await startup;
	return servingHandler.handle(request, authInfo);
}

export function publishUserResourceUpdate(userId: string, uri: string): void {
	servingHandler.publishUserResourceUpdate(userId, uri);
}

export async function publishGrantRevocation(userId: string): Promise<void> {
	await servingHandler.publishGrantRevocation(userId);
}

export async function shutdownMcpTransports(): Promise<void> {
	await servingHandler.shutdown();
	await disconnectRedisSubscriberClient().catch(() => {});
}
