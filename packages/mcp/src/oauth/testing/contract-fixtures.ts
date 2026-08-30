import { defineScopes } from '../../scope-vocabulary.js';
import type {
	CrossInstanceMessaging,
	HandleUnauthenticatedAuthorization,
	MinimalRedisClient,
	OAuthConfiguration,
	OAuthRequestContext,
	OAuthScopeConfiguration,
	RenderConsent,
	ResolveIdentityBinding,
} from '../index.js';
import type {
	ClientStore,
	CodeStore,
	OAuthStores,
	TokenStore,
	TransactionStore,
} from '../stores.js';

/**
 * Compile-time fixtures only. These objects deliberately hold no state and
 * are not working store implementations; behavioral reference stores live in
 * the later testing package boundary.
 */

const transactionStore = {
	create: () => Promise.resolve(),
	consume: () => Promise.resolve(null),
	unconsume: () => Promise.resolve(false),
	purgeExpired: () => Promise.resolve(0),
} satisfies TransactionStore;

const codeStore = {
	issue: () => Promise.resolve(),
	findByCode: () => Promise.resolve(null),
	consume: () => Promise.resolve(null),
	purgeExpired: () => Promise.resolve(0),
} satisfies CodeStore;

const tokenStore = {
	issueAuthorizationGrant: () => Promise.resolve(),
	findByHash: () => Promise.resolve(null),
	rotateRefreshToken: () => Promise.resolve({ status: 'invalid' as const }),
	revokeAccessToken: () => Promise.resolve(false),
	revokeRefreshToken: () => Promise.resolve({ status: 'invalid' as const }),
	revokeFamily: () => Promise.resolve(0),
	purgeExpired: () => Promise.resolve(0),
} satisfies TokenStore;

const clientStore = {
	register: () => Promise.resolve(),
	upsert: () => Promise.resolve(),
	findById: () => Promise.resolve(null),
	update: () => Promise.resolve(),
} satisfies ClientStore;

export const storeContractFixture = {
	transactions: transactionStore,
	codes: codeStore,
	tokens: tokenStore,
	clients: clientStore,
} satisfies OAuthStores;

export const identityContractFixture = (() =>
	Promise.resolve(null)) satisfies ResolveIdentityBinding;

export const unauthenticatedAuthorizationContractFixture = (() =>
	new Response(null, { status: 302 })) satisfies HandleUnauthenticatedAuthorization;

export const consentContractFixture = (() => new Response()) satisfies RenderConsent;

const vocabulary = defineScopes({
	'repositories:read': 'Read repository metadata.',
});

export const scopeContractFixture = {
	vocabulary,
	supportedScopes: ['repositories:read'],
} satisfies OAuthScopeConfiguration;

const minimalRedisClient = {
	eval: () => Promise.resolve(0),
	zRem: () => Promise.resolve(0),
} satisfies MinimalRedisClient;

export const configurationContractFixture = {
	issuer: new URL('https://authorization.example.com'),
	baseUrl: new URL('https://application.example.com'),
	accessTokenTtlSeconds: 3600,
	refreshTokenTtlSeconds: 2_592_000,
	isTrustedOrigin: () => true,
	trustedProxy: {
		trustedProxyCidrs: [],
		trustedProxyHeader: undefined,
		trustedProxyHopCount: 0,
	},
	rateLimits: {
		categories: {},
	},
	rateLimitStores: {
		slidingWindow: {
			consume: () =>
				Promise.resolve({
					allowed: true,
					retryAfterMilliseconds: 0,
					remainingRequests: 0,
				}),
			peek: () => Promise.resolve(0),
		},
		concurrencySlots: {
			acquire: () => Promise.resolve(null),
			renew: () => Promise.resolve(false),
			release: () => Promise.resolve(),
		},
	},
} satisfies OAuthConfiguration;

export const crossInstanceMessagingContractFixture = {
	publish: () => Promise.resolve(),
	subscribe: () => Promise.resolve(() => Promise.resolve()),
} satisfies CrossInstanceMessaging;

export const requestContextContractFixture = {
	request: new Request('https://application.example.com/oauth/authorize'),
	requestUrl: new URL('https://application.example.com/oauth/authorize'),
	requestId: 'request-id',
	socketAddress: '127.0.0.1',
	identity: null,
} satisfies OAuthRequestContext;

export const structuralRedisClientContractFixture: MinimalRedisClient = minimalRedisClient;
