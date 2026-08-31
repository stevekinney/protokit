import { logger } from '@lostgradient/mcp/logger';
import {
	createInMemorySlidingWindowStore,
	createRedisSlidingWindowStore,
	RequestRateLimiter,
	SlidingWindowRateLimiter,
	type AtomicSlidingWindowStore,
	type OAuthRateLimitCategory,
	type RateLimitConfiguration,
	type SlidingWindowRateLimiterResult,
} from '@lostgradient/mcp/rate-limit';
import { environment } from '@web/env';
import { isRedisConfigured, getRedisClient } from '@web/lib/redis-client';

const slidingWindowRateLimiter = new SlidingWindowRateLimiter();
let inMemorySlidingWindowStore = createInMemorySlidingWindowStore();

/** Test-only: replaces the single-process fallback with an empty store. */
export function resetInMemorySlidingWindowStore(): void {
	inMemorySlidingWindowStore = createInMemorySlidingWindowStore();
}

let warnedAboutInMemoryRateLimiter = false;

type HostRateLimitRoute = 'google_auth' | 'health_probe' | 'metrics_probe' | 'session_creation';

function buildRateLimitKey(route: HostRateLimitRoute, identifier: string): string {
	// The namespace is empty in every real deployment, so the key shape is
	// unchanged there. It exists because rate-limit state is keyed by network
	// identity and lives in shared Redis: two test suites running at once are one
	// identity (loopback) spending one budget, so they exhaust the limit between
	// them and fail with a 429 that has nothing to do with what they assert.
	// Giving each run its own namespace isolates the bucket while still
	// exercising the real production limits — as opposed to raising the limit for
	// tests, which would stop them testing the thing they exist to test.
	const namespace = environment.rateLimitKeyNamespace;
	return namespace
		? `rate_limit:${namespace}:${route}:${identifier}`
		: `rate_limit:${route}:${identifier}`;
}

async function resolveAtomicStore(): Promise<AtomicSlidingWindowStore> {
	if (!isRedisConfigured()) {
		if (environment.nodeEnv === 'production') {
			// Belt-and-suspenders: `assertProductionStartupInvariants` should have
			// already refused to boot without Redis. This throw exists so a
			// misconfiguration that slips past startup (e.g. Redis becoming
			// unreachable mid-run) surfaces as a loud 500, never a silent
			// fallback to a per-process limiter in production.
			throw new Error(
				'Refusing to rate-limit with the in-memory fallback in production. REDIS_URL must be set.',
			);
		}

		if (!warnedAboutInMemoryRateLimiter) {
			logger.warn('REDIS_URL not set — using in-memory rate limiter. Not suitable for production.');
			warnedAboutInMemoryRateLimiter = true;
		}

		return inMemorySlidingWindowStore;
	}

	const redisClient = await getRedisClient();
	return createRedisSlidingWindowStore(redisClient);
}

async function consumeRateLimit(input: {
	route: HostRateLimitRoute;
	identifier: string;
	maximumRequests: number;
	windowSeconds: number;
}): Promise<SlidingWindowRateLimiterResult> {
	const atomicStore = await resolveAtomicStore();

	return slidingWindowRateLimiter.consume({
		key: buildRateLimitKey(input.route, input.identifier),
		maximumRequests: input.maximumRequests,
		windowSeconds: input.windowSeconds,
		atomicStore,
	});
}

function createSharedRequestRateLimiter(): RequestRateLimiter {
	const sharedConfiguration: RateLimitConfiguration = {
		keyNamespace: environment.rateLimitKeyNamespace || undefined,
		maximumConcurrent: environment.rateLimitMcpConcurrentMax,
		categories: {
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
			oauth_authorize: {
				maximumRequests: environment.rateLimitAuthorizeMax,
				windowSeconds: environment.rateLimitAuthorizeWindowSeconds,
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
	};
	return new RequestRateLimiter(sharedConfiguration, resolveAtomicStore);
}

async function consumeSharedRateLimit(
	category: OAuthRateLimitCategory,
	identifier: string,
): Promise<SlidingWindowRateLimiterResult> {
	return createSharedRequestRateLimiter().consume(category, identifier);
}

export async function enforceOauthRegistrationRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeSharedRateLimit('oauth_register', input.networkIdentity);
}

/**
 * The pre-parse half of token-endpoint rate limiting: cheap, keyed only by
 * network identity, applied before the request body is parsed. See
 * `enforceOauthTokenClientRateLimit` for the post-parse, client-scoped half.
 */
export async function enforceOauthTokenNetworkRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeSharedRateLimit('oauth_token_network', input.networkIdentity);
}

/**
 * The post-parse half of token-endpoint rate limiting: scoped to the OAuth
 * client so one client's traffic cannot exhaust another client's budget
 * even when both share a network identity (e.g. behind the same NAT).
 */
export async function enforceOauthTokenClientRateLimit(input: {
	networkIdentity: string;
	clientId: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeSharedRateLimit('oauth_token_client', `${input.networkIdentity}:${input.clientId}`);
}

export async function enforceOauthRevokeRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeSharedRateLimit('oauth_revoke', input.networkIdentity);
}

export async function enforceOauthAuthorizeRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeSharedRateLimit('oauth_authorize', input.networkIdentity);
}

export async function enforceGoogleAuthRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'google_auth',
		identifier: input.networkIdentity,
		maximumRequests: environment.rateLimitGoogleAuthMax,
		windowSeconds: environment.rateLimitGoogleAuthWindowSeconds,
	});
}

/** The pre-auth half of MCP rate limiting: cheap, keyed by network identity, applied before token lookup. */
export async function enforceMcpNetworkRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeSharedRateLimit('mcp_network', input.networkIdentity);
}

/** The post-auth half of MCP rate limiting: scoped to the authenticated user. */
export async function enforceMcpRateLimit(input: {
	userId: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeSharedRateLimit('mcp_user', input.userId);
}

export async function enforceHealthProbeRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'health_probe',
		identifier: input.networkIdentity,
		maximumRequests: environment.rateLimitHealthMax,
		windowSeconds: environment.rateLimitHealthWindowSeconds,
	});
}

/**
 * OPS-002: gates both the readiness probe (`GET /health/ready`) and the
 * metrics endpoint (`GET /metrics`), consumed on every request regardless of
 * whether authentication succeeds — a caller with no credential still costs
 * one slot, which is what actually bounds the abuse case (a bearer-token
 * guess loop) rather than only rate-limiting after a failure.
 */
export async function enforceMetricsRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'metrics_probe',
		identifier: input.networkIdentity,
		maximumRequests: environment.rateLimitMetricsMax,
		windowSeconds: environment.rateLimitMetricsWindowSeconds,
	});
}

export async function enforceSessionCreationRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'session_creation',
		identifier: input.networkIdentity,
		maximumRequests: environment.rateLimitSessionMax,
		windowSeconds: environment.rateLimitSessionWindowSeconds,
	});
}

/**
 * A failed-authentication lockout. `isAuthenticationLockedOut` is a
 * best-effort, non-atomic read used only to gate expensive work before it
 * runs — an occasional off-by-one race here just means one extra attempt is
 * let through, which is an acceptable trade-off for a pre-check (unlike
 * admission counting, which stays atomic). `recordFailedAuthentication`
 * performs the actual atomic increment.
 */
export async function isAuthenticationLockedOut(input: {
	networkIdentity: string;
}): Promise<boolean> {
	const currentCount = await createSharedRequestRateLimiter().peek(
		'failed_authentication',
		input.networkIdentity,
	);
	return currentCount >= environment.rateLimitFailedAuthMax;
}

export async function recordFailedAuthentication(input: {
	networkIdentity: string;
}): Promise<void> {
	await consumeSharedRateLimit('failed_authentication', input.networkIdentity);
}
