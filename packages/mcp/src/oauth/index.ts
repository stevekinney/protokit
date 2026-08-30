import type { McpScopeVocabulary } from '../scope-vocabulary.js';
import type { OAuthStores } from './stores.js';

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

export type ConsentPresentation =
	| { mode: 'error'; error: string }
	| {
			mode: 'prompt';
			transactionId: string;
			/** One-time plaintext value rendered into approve and deny submissions. */
			csrfToken: string;
			client: { id: string; name: string };
			scopes: Array<{ scope: string; description: string }>;
	  };

export type RenderConsent = (presentation: ConsentPresentation) => Response | Promise<Response>;

export type OAuthScopeConfiguration<Scope extends string = string> = {
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

export type RateLimitConfiguration = {
	categories: Readonly<Record<string, RateLimitCategoryConfiguration>>;
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
	issuer: URL;
	baseUrl: URL;
	isTrustedOrigin(origin: string): boolean;
	trustedProxy: TrustedProxyConfiguration;
	rateLimits: RateLimitConfiguration;
	rateLimitStores?: {
		slidingWindow: AtomicSlidingWindowStore;
		concurrencySlots: ConcurrencySlotStore;
	};
};

export type CrossInstanceMessaging = {
	publish(channel: string, message: string): Promise<void>;
	subscribe(channel: string, onMessage: (message: string) => void): Promise<() => Promise<void>>;
};

export type OAuthHostSeams<Scope extends string = string> = {
	resolveIdentityBinding: ResolveIdentityBinding;
	renderConsent: RenderConsent;
	stores: OAuthStores;
	scopes: OAuthScopeConfiguration<Scope>;
	configuration: OAuthConfiguration;
	crossInstanceMessaging?: CrossInstanceMessaging;
};

export type {
	AccessToken,
	AuthorizationCode,
	AuthorizationTransaction,
	RefreshToken,
	RegisteredClient,
} from './stores.js';
