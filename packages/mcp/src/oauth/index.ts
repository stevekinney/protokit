import type { McpScopeVocabulary } from '../scope-vocabulary.js';
import type { McpUserProfile } from '../types/primitives.js';
import type { ClientStore, CodeStore, OAuthStores, TokenStore } from './stores.js';
import * as clientMetadataDocuments from './client-metadata-documents.js';
import * as securityUtilities from './security-utilities.js';
import * as canonicalAddressUtilities from './canonicalize-ip-address.js';
export {
	handleOauthAuthorizationMetadataGet,
	handleOauthProtectedResourceMetadataGet,
	handleOauthProtectedResourceMcpMetadataGet,
	oauthCorsHeaders,
} from './discovery-metadata.js';
export type { OAuthDiscoveryConfiguration } from './discovery-metadata.js';

export const fetchClientIdMetadataDocument = clientMetadataDocuments.fetchClientIdMetadataDocument;
export const isClientIdMetadataDocumentUrl = clientMetadataDocuments.isClientIdMetadataDocumentUrl;
export const safeFetchPublicHttpsUrl = clientMetadataDocuments.safeFetchPublicHttpsUrl;
export const isAddressInCidr = securityUtilities.isAddressInCidr;
export const isValidCidr = securityUtilities.isValidCidr;
export const isValidRedirectUri = securityUtilities.isValidRedirectUri;
export const isValidClientName = securityUtilities.isValidClientName;
export const isExactContentType = securityUtilities.isExactContentType;
export const withDeadline = securityUtilities.withDeadline;
export const canonicalizeIpAddress = canonicalAddressUtilities.canonicalizeIpAddress;
export const expandIpv6Groups = canonicalAddressUtilities.expandIpv6Groups;
export const stripPort = canonicalAddressUtilities.stripPort;
export type {
	ClientIdMetadataDocument,
	ClientMetadataDocumentFetchDependencies,
	DnsLookupAllFunction,
	SafePublicHttpsFetchOptions,
} from './client-metadata-documents.js';

export type TrustedProxyHeader = 'x-forwarded-for' | 'forwarded' | 'cf-connecting-ip';

export type TrustedProxyConfiguration = {
	/** CIDR blocks whose immediate socket peer may supply the configured forwarding header. */
	trustedProxyCidrs: string[];
	/** Undefined means forwarding headers are never trusted. */
	trustedProxyHeader: TrustedProxyHeader | undefined;
	/** Number of trusted proxy hops preceding the client in a multi-value header. */
	trustedProxyHopCount: number;
};

export type OAuthRequestContext = {
	request: Request;
	requestUrl: URL;
	requestId: string;
	/**
	 * The immediate socket peer, not an adapter-resolved forwarding header.
	 * The library combines this with `request.headers` and the trusted-proxy
	 * configuration before deriving a rate-limit or lockout identity.
	 */
	socketAddress?: string;
	/** Durable host subject and opaque consent binding, resolved together. */
	identity: OAuthIdentity | null;
};

export type OAuthIdentity = {
	/** Durable subject identifier persisted on grants and tokens. */
	subjectId: string;
	/** Opaque account or session value used only to bind consent. */
	consentBinding: string;
};

/** Resolves durable attribution and an opaque consent binding in one host lookup. */
export type ResolveIdentityBinding = (request: Request) => Promise<OAuthIdentity | null>;

/** Resolves the host profile required to construct MCP context for a token subject. */
export type ResolveUserProfile = (subjectId: string) => Promise<McpUserProfile | null>;

/** Starts or otherwise handles host authentication for an authorization request. */
export type HandleUnauthenticatedAuthorization = (request: Request) => Response | Promise<Response>;

export type ConsentPresentation =
	| { mode: 'error'; error: string }
	| {
			mode: 'prompt';
			transactionId: string;
			/** One-time plaintext value rendered into approve and deny submissions. */
			csrfToken: string;
			/** Verified client redirect URI shown as consent destination context. */
			redirectUri: string;
			/** Authenticated host profile displayed as the account granting consent. */
			requester: McpUserProfile;
			client: { id: string; name: string };
			scopes: Array<{ scope: string; description: string }>;
	  };

export type RenderConsent = (presentation: ConsentPresentation) => Response | Promise<Response>;

export type OAuthScopeConfiguration<Scope extends string> = {
	vocabulary: McpScopeVocabulary<Scope>;
	/** Production scopes mechanically derived from the registry being served. */
	supportedScopes: readonly Scope[];
};

export type SlidingWindowRateLimiterResult = {
	allowed: boolean;
	retryAfterSeconds: number;
	remainingRequests: number;
};

/**
 * Performs one indivisible prune-count-admit operation. Splitting admission
 * across remove, count, and add round trips reopens the concurrency race this
 * contract exists to prevent.
 */
export type AtomicSlidingWindowStore = {
	consume(input: {
		key: string;
		nowMilliseconds: number;
		windowMilliseconds: number;
		maximumRequests: number;
		member: string;
	}): Promise<{
		allowed: boolean;
		retryAfterMilliseconds: number;
		remainingRequests: number;
	}>;
	/**
	 * Best-effort and non-atomic. This is suitable only for advisory checks
	 * that tolerate an off-by-one race, never for admission control.
	 */
	peek(input: {
		key: string;
		nowMilliseconds: number;
		windowMilliseconds: number;
	}): Promise<number>;
};

export type ConcurrencySlot = { readonly id: string };

export interface ConcurrencySlotStore {
	acquire(
		key: string,
		maximumConcurrent: number,
		ttlMilliseconds: number,
	): Promise<ConcurrencySlot | null>;
	renew(key: string, slot: ConcurrencySlot, ttlMilliseconds: number): Promise<boolean>;
	release(key: string, slot: ConcurrencySlot): Promise<void>;
}

export type RateLimitCategoryConfiguration = {
	maximumRequests: number;
	windowSeconds: number;
};

export type OAuthRateLimitCategory =
	| 'oauth_authorize'
	| 'oauth_register'
	| 'oauth_token_network'
	| 'oauth_token_client'
	| 'oauth_revoke'
	| 'mcp_network'
	| 'mcp_user'
	| 'failed_authentication';

export type RateLimitConfiguration = {
	categories: Readonly<Record<OAuthRateLimitCategory, RateLimitCategoryConfiguration>>;
	/** Maximum live operations admitted through the concurrency slot store. */
	maximumConcurrent: number;
	/**
	 * Optional isolation for shared backing stores. Real deployments leave it
	 * empty; concurrent test runs use distinct values instead of weakening the
	 * limits they are meant to exercise.
	 */
	keyNamespace?: string;
};

/** Only the Redis operations required by the library-provided store factories. */
export interface MinimalRedisClient {
	eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
	zRem(key: string, member: string): Promise<number>;
}

export type OAuthConfiguration = {
	/** Exact OAuth issuer identifier. Consumers must use this same value in authorization responses. */
	issuer: string;
	baseUrl: URL;
	/** Canonical RFC 8707 resource identifier accepted by both token grants. */
	resource: URL;
	accessTokenTtlSeconds: number;
	refreshTokenTtlSeconds: number;
	clientSecretTtlSeconds: number;
	isTrustedOrigin(origin: string): boolean;
	trustedProxy: TrustedProxyConfiguration;
	rateLimits: RateLimitConfiguration;
	/**
	 * Authorization-server metadata advertises MCP Apps support only when this
	 * is enabled and the injected registry contains an MCP App resource.
	 */
	mcpUiExtension: {
		enabled: boolean;
	};
	rateLimitStores?: {
		slidingWindow: AtomicSlidingWindowStore;
		concurrencySlots?: ConcurrencySlotStore;
	};
};

export type CrossInstanceMessaging = {
	publish(channel: string, message: string): Promise<void>;
	subscribe(channel: string, onMessage: (message: string) => void): Promise<() => Promise<void>>;
};

export type OAuthHostSeams<Scope extends string> = {
	resolveIdentityBinding: ResolveIdentityBinding;
	resolveUserProfile: ResolveUserProfile;
	handleUnauthenticatedAuthorization: HandleUnauthenticatedAuthorization;
	renderConsent: RenderConsent;
	stores: OAuthStores;
	scopes: OAuthScopeConfiguration<Scope>;
	configuration: OAuthConfiguration;
	crossInstanceMessaging?: CrossInstanceMessaging;
};

/** Host capabilities needed by endpoints that do not render application UI. */
export type OAuthStatelessHostSeams<Scope extends string> = Pick<
	OAuthHostSeams<Scope>,
	'scopes' | 'configuration' | 'crossInstanceMessaging'
> & {
	stores: { clients: ClientStore; codes: CodeStore; tokens: TokenStore };
	/** Existing host credential hash function; plaintext credentials never cross into stores. */
	hashCredential(value: string): string;
	/** Disconnect or notify live grants after a replay or explicit revocation. */
	publishGrantRevocation?(subjectId: string): Promise<void>;
	/** Preserve host metrics and structured logs without coupling the library to a logger. */
	recordEvent?(event: {
		category:
			'registration' | 'client_authentication' | 'token_exchange' | 'refresh' | 'revocation';
		outcome: string;
		attributes?: Readonly<Record<string, string | boolean>>;
	}): void;
};

export { authenticateOauthClient } from './client-authentication.js';
export { constantTimeEquals } from './security-utilities.js';
export { handleOauthRegisterPost } from './registration-endpoint.js';
export { handleOauthTokenPost } from './token-endpoint.js';
export { handleOauthRevokePost } from './revocation-endpoint.js';
export { isValidPkceCodeChallenge, isValidPkceCodeVerifier } from './pkce-validation.js';
export { isSocketPeerTrusted, resolveOauthNetworkIdentity } from './network-identity.js';

export type {
	AccessToken,
	AuthorizationCode,
	AuthorizationTransaction,
	RefreshToken,
	RegisteredClient,
} from './stores.js';
