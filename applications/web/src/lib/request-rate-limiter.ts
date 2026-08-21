import { logger } from '@template/mcp/logger';
import { environment } from '@web/env';
import { inMemorySlidingWindowStore } from '@web/lib/in-memory-sliding-window-store';
import { isRedisConfigured, getRedisClient } from '@web/lib/redis-client';
import { createRedisSlidingWindowStore } from '@web/lib/redis-sliding-window-store';
import {
	SlidingWindowRateLimiter,
	type AtomicSlidingWindowStore,
	type SlidingWindowRateLimiterResult,
} from '@web/lib/sliding-window-rate-limiter';

const slidingWindowRateLimiter = new SlidingWindowRateLimiter();

let warnedAboutInMemoryRateLimiter = false;

type RateLimitRoute =
	| 'oauth_register'
	| 'oauth_token_network'
	| 'oauth_token_client'
	| 'oauth_revoke'
	| 'oauth_authorize'
	| 'google_auth'
	| 'mcp_network'
	| 'mcp_user'
	| 'health_probe'
	| 'failed_authentication'
	| 'session_creation';

function buildRateLimitKey(route: RateLimitRoute, identifier: string): string {
	// The namespace is empty in every real deployment, so the key shape is
	// unchanged there. It exists because rate-limit state is keyed by network
	// identity and lives in shared Redis: two test suites running at once are one
	// identity (loopback) spending one budget, so they exhaust the limit between
	// them and fail with a 429 that has nothing to do with what they assert.
	// Giving each run its own namespace isolates the bucket while still
	// exercising the real production limits — as opposed to raising the limit for
	// tests, which would stop them testing the thing they exist to test.
	const namespace = environment.RATE_LIMIT_KEY_NAMESPACE;
	return namespace
		? `rate_limit:${namespace}:${route}:${identifier}`
		: `rate_limit:${route}:${identifier}`;
}

async function resolveAtomicStore(): Promise<AtomicSlidingWindowStore> {
	if (!isRedisConfigured()) {
		if (environment.NODE_ENV === 'production') {
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
	route: RateLimitRoute;
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

export async function enforceOauthRegistrationRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'oauth_register',
		identifier: input.networkIdentity,
		maximumRequests: environment.RATE_LIMIT_REGISTER_MAX,
		windowSeconds: environment.RATE_LIMIT_REGISTER_WINDOW_SECONDS,
	});
}

/**
 * The pre-parse half of token-endpoint rate limiting: cheap, keyed only by
 * network identity, applied before the request body is parsed. See
 * `enforceOauthTokenClientRateLimit` for the post-parse, client-scoped half.
 */
export async function enforceOauthTokenNetworkRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'oauth_token_network',
		identifier: input.networkIdentity,
		maximumRequests: environment.RATE_LIMIT_TOKEN_MAX,
		windowSeconds: environment.RATE_LIMIT_TOKEN_WINDOW_SECONDS,
	});
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
	return consumeRateLimit({
		route: 'oauth_token_client',
		identifier: `${input.networkIdentity}:${input.clientId}`,
		maximumRequests: environment.RATE_LIMIT_TOKEN_MAX,
		windowSeconds: environment.RATE_LIMIT_TOKEN_WINDOW_SECONDS,
	});
}

export async function enforceOauthRevokeRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'oauth_revoke',
		identifier: input.networkIdentity,
		maximumRequests: environment.RATE_LIMIT_REVOKE_MAX,
		windowSeconds: environment.RATE_LIMIT_REVOKE_WINDOW_SECONDS,
	});
}

export async function enforceOauthAuthorizeRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'oauth_authorize',
		identifier: input.networkIdentity,
		maximumRequests: environment.RATE_LIMIT_AUTHORIZE_MAX,
		windowSeconds: environment.RATE_LIMIT_AUTHORIZE_WINDOW_SECONDS,
	});
}

export async function enforceGoogleAuthRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'google_auth',
		identifier: input.networkIdentity,
		maximumRequests: environment.RATE_LIMIT_GOOGLE_AUTH_MAX,
		windowSeconds: environment.RATE_LIMIT_GOOGLE_AUTH_WINDOW_SECONDS,
	});
}

/** The pre-auth half of MCP rate limiting: cheap, keyed by network identity, applied before token lookup. */
export async function enforceMcpNetworkRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'mcp_network',
		identifier: input.networkIdentity,
		maximumRequests: environment.RATE_LIMIT_MCP_MAX,
		windowSeconds: environment.RATE_LIMIT_MCP_WINDOW_SECONDS,
	});
}

/** The post-auth half of MCP rate limiting: scoped to the authenticated user. */
export async function enforceMcpRateLimit(input: {
	userId: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'mcp_user',
		identifier: input.userId,
		maximumRequests: environment.RATE_LIMIT_MCP_MAX,
		windowSeconds: environment.RATE_LIMIT_MCP_WINDOW_SECONDS,
	});
}

export async function enforceHealthProbeRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'health_probe',
		identifier: input.networkIdentity,
		maximumRequests: environment.RATE_LIMIT_HEALTH_MAX,
		windowSeconds: environment.RATE_LIMIT_HEALTH_WINDOW_SECONDS,
	});
}

export async function enforceSessionCreationRateLimit(input: {
	networkIdentity: string;
}): Promise<SlidingWindowRateLimiterResult> {
	return consumeRateLimit({
		route: 'session_creation',
		identifier: input.networkIdentity,
		maximumRequests: environment.RATE_LIMIT_SESSION_MAX,
		windowSeconds: environment.RATE_LIMIT_SESSION_WINDOW_SECONDS,
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
	const atomicStore = await resolveAtomicStore();
	const currentCount = await slidingWindowRateLimiter.peek({
		key: buildRateLimitKey('failed_authentication', input.networkIdentity),
		windowSeconds: environment.RATE_LIMIT_FAILED_AUTH_WINDOW_SECONDS,
		atomicStore,
	});
	return currentCount >= environment.RATE_LIMIT_FAILED_AUTH_MAX;
}

export async function recordFailedAuthentication(input: {
	networkIdentity: string;
}): Promise<void> {
	await consumeRateLimit({
		route: 'failed_authentication',
		identifier: input.networkIdentity,
		maximumRequests: environment.RATE_LIMIT_FAILED_AUTH_MAX,
		windowSeconds: environment.RATE_LIMIT_FAILED_AUTH_WINDOW_SECONDS,
	});
}
