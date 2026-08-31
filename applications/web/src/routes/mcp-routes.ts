import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { getSupportedScopes, templateRegistry } from '@lostgradient/mcp';
import { createMcpHttpServingLayer } from '@lostgradient/mcp/http';
import { logger } from '@lostgradient/mcp/logger';
import { metricsCollector } from '@lostgradient/mcp/metrics';
import { environment } from '@web/env';
import { hashCredential } from '@web/lib/hash-credential';
import { handleMcpRequest } from '@web/lib/mcp-handler';
import { parseAllowedOrigins } from '@web/lib/mcp-origin-validation';
import { mcpLatestProtocolVersion } from '@web/lib/mcp-protocol-constants';
import { getMcpResourceUrl } from '@web/lib/mcp-request-context';
import { acquireMcpConcurrencySlot } from '@web/lib/mcp-concurrency-limiter';
import { oauthStatelessStores } from '@web/lib/oauth-stateless-stores';
import { createSharedRequestRateLimiter } from '@web/lib/request-rate-limiter';
import { getTrustedProxyConfiguration } from '@web/lib/request-client-identifier';
import type { RequestContext } from '@web/lib/request-context';
import { mcpMaxBearerTokenLength } from '@web/lib/request-limits';

export function isDnsRebindingProtectionActive(input: {
	conformanceModeConfigured: boolean;
	tunnelActive: boolean;
}): boolean {
	return !input.conformanceModeConfigured && !input.tunnelActive;
}

async function resolveUserProfile(subjectId: string) {
	const [user] = await database
		.select({
			id: schema.users.id,
			email: schema.users.email,
			name: schema.users.name,
			image: schema.users.image,
			role: schema.users.role,
		})
		.from(schema.users)
		.where(eq(schema.users.id, subjectId))
		.limit(1);
	return user ?? null;
}

async function findTokenAndUserProfileByHash(tokenHash: string) {
	const [record] = await database
		.select({
			accessTokenHash: schema.oauthTokens.accessToken,
			clientId: schema.oauthTokens.clientId,
			userId: schema.oauthTokens.userId,
			scope: schema.oauthTokens.scope,
			resource: schema.oauthTokens.resource,
			expiresAt: schema.oauthTokens.expiresAt,
			revokedAt: schema.oauthTokens.revokedAt,
			createdAt: schema.oauthTokens.createdAt,
			profileId: schema.users.id,
			profileEmail: schema.users.email,
			profileName: schema.users.name,
			profileImage: schema.users.image,
			profileRole: schema.users.role,
		})
		.from(schema.oauthTokens)
		.innerJoin(schema.users, eq(schema.oauthTokens.userId, schema.users.id))
		.where(eq(schema.oauthTokens.accessToken, tokenHash))
		.limit(1);
	if (!record) return null;
	return {
		token: {
			accessTokenHash: record.accessTokenHash,
			clientId: record.clientId,
			userId: record.userId,
			scope: record.scope,
			resource: record.resource,
			expiresAt: record.expiresAt,
			revokedAt: record.revokedAt,
			createdAt: record.createdAt,
		},
		profile: {
			id: record.profileId,
			email: record.profileEmail,
			name: record.profileName,
			image: record.profileImage,
			role: record.profileRole,
		},
	};
}

export async function handleMcpRequestWithAuthentication(
	context: RequestContext,
): Promise<Response> {
	const rateLimiter = createSharedRequestRateLimiter();
	const servingLayer = createMcpHttpServingLayer({
		authenticationConfiguration: {
			resource: new URL(getMcpResourceUrl(context.request)),
			protocolVersion: mcpLatestProtocolVersion,
			supportedScopes: getSupportedScopes(templateRegistry),
			allowedOrigins: parseAllowedOrigins(environment.mcpAllowedOrigins),
			maximumBearerTokenLength: mcpMaxBearerTokenLength,
			maximumFailedAuthenticationAttempts: environment.rateLimitFailedAuthMax,
			trustedProxy: getTrustedProxyConfiguration(),
			dnsRebindingProtection: isDnsRebindingProtectionActive({
				conformanceModeConfigured: environment.mcpConformanceMode,
				tunnelActive: environment.protokitTunnelActive,
			}),
		},
		authenticationSeams: {
			tokens: oauthStatelessStores.tokens,
			resolveUserProfile,
			findTokenAndUserProfileByHash,
			hashCredential,
			rateLimiter,
			recordEvent: (outcome, requestId) => {
				const log = outcome === 'success' ? logger.info.bind(logger) : logger.warn.bind(logger);
				log({ event: 'mcp_authentication', outcome, requestId }, 'MCP authentication outcome');
				metricsCollector.recordEvent('authorization', outcome);
			},
		},
		rateLimiter,
		concurrencyLimiter: {
			acquire: async (key) =>
				acquireMcpConcurrencySlot({
					userId: key.replace(/^rate_limit:mcp_concurrent:/, ''),
				}),
		},
		handler: { handle: handleMcpRequest },
	});
	return servingLayer.handle({
		request: context.request,
		requestUrl: context.requestUrl,
		requestId: context.requestId,
		socketAddress: context.clientAddress,
		identity: null,
	});
}
