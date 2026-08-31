import {
	defineOAuthScopeConfiguration,
	getSupportedScopes,
	templateRegistry,
	templateScopeVocabulary,
} from '@lostgradient/mcp';
import type {
	AtomicSlidingWindowStore,
	OAuthRequestContext,
	OAuthStatelessHostSeams,
} from '@lostgradient/mcp/oauth';
import { logger } from '@lostgradient/mcp/logger';
import { metricsCollector } from '@lostgradient/mcp/metrics';
import { environment } from '@web/env';
import { getBaseUrl } from '@web/lib/base-url';
import { OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS } from '@web/lib/credential-lifecycle-policy';
import { hashCredential } from '@web/lib/hash-credential';
import { getMcpResourceUrl } from '@web/lib/mcp-request-context';
import { publishGrantRevocation } from '@web/lib/mcp-handler';
import { oauthStatelessStores } from '@web/lib/oauth-stateless-stores';
import { getTrustedProxyConfiguration } from '@web/lib/request-client-identifier';
import type { RequestContext } from '@web/lib/request-context';
import { resolveOauthAtomicSlidingWindowStore } from '@web/lib/request-rate-limiter';

const scopes = defineOAuthScopeConfiguration({
	vocabulary: templateScopeVocabulary,
	supportedScopes: getSupportedScopes(templateRegistry),
});

const oauthSlidingWindowStore: AtomicSlidingWindowStore = {
	consume: async (input) => (await resolveOauthAtomicSlidingWindowStore()).consume(input),
	peek: async (input) => (await resolveOauthAtomicSlidingWindowStore()).peek(input),
};

const oauthLogEventNames = {
	authorization: 'oauth_authorization',
	registration: 'oauth_client_registration',
	client_authentication: 'oauth_client_authentication',
	token_exchange: 'oauth_token_exchange',
	refresh: 'oauth_token_exchange',
	revocation: 'oauth_revocation',
} as const;

export function toOauthRequestContext(context: RequestContext): OAuthRequestContext {
	return {
		request: context.request,
		requestUrl: context.requestUrl,
		requestId: context.requestId,
		socketAddress: context.clientAddress,
		identity:
			context.user && context.sessionToken
				? { subjectId: context.user.id, consentBinding: context.sessionToken }
				: null,
	};
}

export function createOauthStatelessHostSeams(
	request: Request,
): OAuthStatelessHostSeams<(typeof scopes.supportedScopes)[number]> {
	const baseUrl = new URL(getBaseUrl(request));
	return {
		stores: oauthStatelessStores,
		scopes,
		hashCredential,
		publishGrantRevocation,
		recordEvent: ({ category, outcome, attributes }) => {
			const replayDetected = outcome === 'replay_detected';
			const log = replayDetected ? logger.warn.bind(logger) : logger.info.bind(logger);
			log(
				{
					event: oauthLogEventNames[category],
					outcome: replayDetected ? 'refresh_replay' : outcome,
					...attributes,
				},
				replayDetected
					? 'refresh token reuse detected; revoked token family'
					: 'OAuth endpoint outcome',
			);
			metricsCollector.recordEvent(category, outcome);
		},
		configuration: {
			issuer: baseUrl.href.replace(/\/$/, ''),
			baseUrl,
			resource: new URL(getMcpResourceUrl(request)),
			accessTokenTtlSeconds: environment.mcpTokenTtlSeconds,
			refreshTokenTtlSeconds: environment.mcpRefreshTokenTtlSeconds,
			clientSecretTtlSeconds: OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS / 1000,
			isTrustedOrigin: (origin) =>
				environment.mcpAllowedOrigins
					.split(',')
					.map((value) => value.trim())
					.includes(origin),
			trustedProxy: getTrustedProxyConfiguration(),
			rateLimits: {
				keyNamespace: environment.rateLimitKeyNamespace || undefined,
				maximumConcurrent: environment.rateLimitMcpConcurrentMax,
				categories: {
					oauth_authorize: {
						maximumRequests: environment.rateLimitAuthorizeMax,
						windowSeconds: environment.rateLimitAuthorizeWindowSeconds,
					},
					oauth_register: {
						maximumRequests: environment.rateLimitRegisterMax,
						windowSeconds: environment.rateLimitRegisterWindowSeconds,
					},
					oauth_token_network: {
						maximumRequests: environment.rateLimitTokenMax,
						windowSeconds: environment.rateLimitTokenWindowSeconds,
					},
					oauth_token_client: {
						maximumRequests: environment.rateLimitTokenMax,
						windowSeconds: environment.rateLimitTokenWindowSeconds,
					},
					oauth_revoke: {
						maximumRequests: environment.rateLimitRevokeMax,
						windowSeconds: environment.rateLimitRevokeWindowSeconds,
					},
					mcp_network: {
						maximumRequests: environment.rateLimitMcpMax,
						windowSeconds: environment.rateLimitMcpWindowSeconds,
					},
					mcp_user: {
						maximumRequests: environment.rateLimitMcpMax,
						windowSeconds: environment.rateLimitMcpWindowSeconds,
					},
					failed_authentication: {
						maximumRequests: environment.rateLimitFailedAuthMax,
						windowSeconds: environment.rateLimitFailedAuthWindowSeconds,
					},
				},
			},
			mcpUiExtension: { enabled: environment.mcpEnableUiExtension },
			rateLimitStores: {
				slidingWindow: oauthSlidingWindowStore,
			},
		},
	};
}
