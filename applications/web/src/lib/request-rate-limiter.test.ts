import { describe, expect, it, mock, beforeEach } from 'bun:test';

mock.module('@web/env', () => ({
	environment: {
		NODE_ENV: 'test',
		RATE_LIMIT_REGISTER_MAX: 3,
		RATE_LIMIT_REGISTER_WINDOW_SECONDS: 60,
		RATE_LIMIT_TOKEN_MAX: 5,
		RATE_LIMIT_TOKEN_WINDOW_SECONDS: 60,
		RATE_LIMIT_MCP_MAX: 10,
		RATE_LIMIT_MCP_WINDOW_SECONDS: 60,
		RATE_LIMIT_REVOKE_MAX: 4,
		RATE_LIMIT_REVOKE_WINDOW_SECONDS: 60,
		RATE_LIMIT_AUTHORIZE_MAX: 4,
		RATE_LIMIT_AUTHORIZE_WINDOW_SECONDS: 60,
		RATE_LIMIT_GOOGLE_AUTH_MAX: 4,
		RATE_LIMIT_GOOGLE_AUTH_WINDOW_SECONDS: 60,
		RATE_LIMIT_HEALTH_MAX: 4,
		RATE_LIMIT_HEALTH_WINDOW_SECONDS: 60,
		RATE_LIMIT_SESSION_MAX: 4,
		RATE_LIMIT_SESSION_WINDOW_SECONDS: 60,
		RATE_LIMIT_FAILED_AUTH_MAX: 3,
		RATE_LIMIT_FAILED_AUTH_WINDOW_SECONDS: 300,
	},
}));

// No REDIS_URL configured -> the module falls back to the real, genuinely
// atomic in-memory store rather than a hand-rolled fake that could drift
// from production Redis semantics.
mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => false,
	getRedisClient: async () => {
		throw new Error('should not be called when Redis is not configured');
	},
}));

const {
	enforceOauthRegistrationRateLimit,
	enforceOauthTokenNetworkRateLimit,
	enforceOauthTokenClientRateLimit,
	enforceOauthRevokeRateLimit,
	enforceOauthAuthorizeRateLimit,
	enforceGoogleAuthRateLimit,
	enforceMcpRateLimit,
	enforceHealthProbeRateLimit,
	enforceSessionCreationRateLimit,
	isAuthenticationLockedOut,
	recordFailedAuthentication,
} = await import('@web/lib/request-rate-limiter');
const { resetInMemorySlidingWindowStore } = await import('@web/lib/in-memory-sliding-window-store');

describe('enforceOauthRegistrationRateLimit', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('allows requests under the limit', async () => {
		const result = await enforceOauthRegistrationRateLimit({ networkIdentity: '1.2.3.4' });
		expect(result.allowed).toBe(true);
	});

	it('denies requests over the limit', async () => {
		for (let i = 0; i < 3; i++) {
			await enforceOauthRegistrationRateLimit({ networkIdentity: '1.2.3.4' });
		}
		const result = await enforceOauthRegistrationRateLimit({ networkIdentity: '1.2.3.4' });
		expect(result.allowed).toBe(false);
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('scopes the limit by network identity', async () => {
		for (let i = 0; i < 3; i++) {
			await enforceOauthRegistrationRateLimit({ networkIdentity: '1.2.3.4' });
		}
		const result = await enforceOauthRegistrationRateLimit({ networkIdentity: '5.6.7.8' });
		expect(result.allowed).toBe(true);
	});
});

describe('oauth token endpoint rate limiting', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('allows the pre-parse network-scoped check under the limit', async () => {
		const result = await enforceOauthTokenNetworkRateLimit({ networkIdentity: '5.6.7.8' });
		expect(result.allowed).toBe(true);
	});

	it('denies the pre-parse network-scoped check over the limit', async () => {
		for (let i = 0; i < 5; i++) {
			await enforceOauthTokenNetworkRateLimit({ networkIdentity: '5.6.7.8' });
		}
		const result = await enforceOauthTokenNetworkRateLimit({ networkIdentity: '5.6.7.8' });
		expect(result.allowed).toBe(false);
	});

	it('scopes the post-parse client check so two clients on one network do not share a bucket', async () => {
		for (let i = 0; i < 5; i++) {
			await enforceOauthTokenClientRateLimit({ networkIdentity: '5.6.7.8', clientId: 'client-a' });
		}
		const exhausted = await enforceOauthTokenClientRateLimit({
			networkIdentity: '5.6.7.8',
			clientId: 'client-a',
		});
		expect(exhausted.allowed).toBe(false);

		const otherClient = await enforceOauthTokenClientRateLimit({
			networkIdentity: '5.6.7.8',
			clientId: 'client-b',
		});
		expect(otherClient.allowed).toBe(true);
	});
});

describe('enforceOauthRevokeRateLimit', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('is a separate bucket from the token endpoint', async () => {
		for (let i = 0; i < 5; i++) {
			await enforceOauthTokenNetworkRateLimit({ networkIdentity: '9.9.9.9' });
		}
		const result = await enforceOauthRevokeRateLimit({ networkIdentity: '9.9.9.9' });
		expect(result.allowed).toBe(true);
	});
});

describe('enforceOauthAuthorizeRateLimit', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('denies requests over the limit', async () => {
		for (let i = 0; i < 4; i++) {
			await enforceOauthAuthorizeRateLimit({ networkIdentity: '1.1.1.1' });
		}
		const result = await enforceOauthAuthorizeRateLimit({ networkIdentity: '1.1.1.1' });
		expect(result.allowed).toBe(false);
	});
});

describe('enforceGoogleAuthRateLimit', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('denies requests over the limit', async () => {
		for (let i = 0; i < 4; i++) {
			await enforceGoogleAuthRateLimit({ networkIdentity: '2.2.2.2' });
		}
		const result = await enforceGoogleAuthRateLimit({ networkIdentity: '2.2.2.2' });
		expect(result.allowed).toBe(false);
	});
});

describe('enforceHealthProbeRateLimit', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('denies requests over the limit', async () => {
		for (let i = 0; i < 4; i++) {
			await enforceHealthProbeRateLimit({ networkIdentity: '3.3.3.3' });
		}
		const result = await enforceHealthProbeRateLimit({ networkIdentity: '3.3.3.3' });
		expect(result.allowed).toBe(false);
	});
});

describe('enforceSessionCreationRateLimit', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('denies requests over the limit', async () => {
		for (let i = 0; i < 4; i++) {
			await enforceSessionCreationRateLimit({ networkIdentity: '4.4.4.4' });
		}
		const result = await enforceSessionCreationRateLimit({ networkIdentity: '4.4.4.4' });
		expect(result.allowed).toBe(false);
	});
});

describe('enforceMcpRateLimit', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('allows requests under the limit', async () => {
		const result = await enforceMcpRateLimit({ userId: 'user-1' });
		expect(result.allowed).toBe(true);
	});

	it('denies requests over the limit', async () => {
		for (let i = 0; i < 10; i++) {
			await enforceMcpRateLimit({ userId: 'user-1' });
		}
		const result = await enforceMcpRateLimit({ userId: 'user-1' });
		expect(result.allowed).toBe(false);
	});
});

describe('failed authentication lockout', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('is not locked out before any failures are recorded', async () => {
		const lockedOut = await isAuthenticationLockedOut({ networkIdentity: '6.6.6.6' });
		expect(lockedOut).toBe(false);
	});

	it('locks out after the configured number of failures', async () => {
		for (let i = 0; i < 3; i++) {
			await recordFailedAuthentication({ networkIdentity: '6.6.6.6' });
		}
		const lockedOut = await isAuthenticationLockedOut({ networkIdentity: '6.6.6.6' });
		expect(lockedOut).toBe(true);
	});

	it('scopes lockouts by network identity', async () => {
		for (let i = 0; i < 3; i++) {
			await recordFailedAuthentication({ networkIdentity: '6.6.6.6' });
		}
		const lockedOut = await isAuthenticationLockedOut({ networkIdentity: '7.7.7.7' });
		expect(lockedOut).toBe(false);
	});
});
