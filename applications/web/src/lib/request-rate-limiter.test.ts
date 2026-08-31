import { describe, expect, it, mock, beforeEach } from 'bun:test';

mock.module('@web/env', () => ({
	environment: {
		nodeEnv: 'test',
		rateLimitRegisterMax: 3,
		rateLimitRegisterWindowSeconds: 60,
		rateLimitTokenMax: 5,
		rateLimitTokenWindowSeconds: 60,
		rateLimitMcpMax: 10,
		rateLimitMcpWindowSeconds: 60,
		rateLimitRevokeMax: 4,
		rateLimitRevokeWindowSeconds: 60,
		rateLimitAuthorizeMax: 4,
		rateLimitAuthorizeWindowSeconds: 60,
		rateLimitGoogleAuthMax: 4,
		rateLimitGoogleAuthWindowSeconds: 60,
		rateLimitHealthMax: 4,
		rateLimitHealthWindowSeconds: 60,
		rateLimitSessionMax: 4,
		rateLimitSessionWindowSeconds: 60,
		rateLimitFailedAuthMax: 3,
		rateLimitFailedAuthWindowSeconds: 300,
		rateLimitMetricsMax: 4,
		rateLimitMetricsWindowSeconds: 60,
	},
}));

// No REDIS_URL configured (the `@web/env` mock above omits it) -> the real
// `isRedisConfigured()` genuinely returns false and the module falls back to
// the real, genuinely atomic in-memory store rather than a hand-rolled fake
// that could drift from production Redis semantics. This deliberately does
// NOT also mock `@web/lib/redis-client` itself: `mock.module` replaces that
// module in Bun's shared module registry for the rest of the test process,
// not just this file, which would silently break every later file's own use
// of the module's other exports (like `isRedisHealthy`).
const {
	enforceOauthRegistrationRateLimit,
	enforceOauthTokenNetworkRateLimit,
	enforceOauthTokenClientRateLimit,
	enforceOauthRevokeRateLimit,
	enforceOauthAuthorizeRateLimit,
	enforceGoogleAuthRateLimit,
	enforceMcpNetworkRateLimit,
	enforceMcpRateLimit,
	enforceHealthProbeRateLimit,
	enforceMetricsRateLimit,
	enforceSessionCreationRateLimit,
	isAuthenticationLockedOut,
	recordFailedAuthentication,
	resetInMemorySlidingWindowStore,
} = await import('@web/lib/request-rate-limiter');

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

describe('enforceMcpNetworkRateLimit', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('allows requests under the limit', async () => {
		const result = await enforceMcpNetworkRateLimit({ networkIdentity: '6.6.6.6' });
		expect(result.allowed).toBe(true);
	});

	it('denies requests over the limit', async () => {
		for (let i = 0; i < 10; i++) {
			await enforceMcpNetworkRateLimit({ networkIdentity: '6.6.6.6' });
		}
		const result = await enforceMcpNetworkRateLimit({ networkIdentity: '6.6.6.6' });
		expect(result.allowed).toBe(false);
	});

	it('is a separate bucket from the post-auth, user-scoped MCP limit', async () => {
		for (let i = 0; i < 10; i++) {
			await enforceMcpNetworkRateLimit({ networkIdentity: '7.7.7.7' });
		}
		const result = await enforceMcpRateLimit({ userId: '7.7.7.7' });
		expect(result.allowed).toBe(true);
	});
});

describe('enforceMetricsRateLimit', () => {
	beforeEach(() => {
		resetInMemorySlidingWindowStore();
	});

	it('allows requests under the limit', async () => {
		const result = await enforceMetricsRateLimit({ networkIdentity: '8.8.8.8' });
		expect(result.allowed).toBe(true);
	});

	it('denies requests over the limit', async () => {
		for (let i = 0; i < 4; i++) {
			await enforceMetricsRateLimit({ networkIdentity: '8.8.8.8' });
		}
		const result = await enforceMetricsRateLimit({ networkIdentity: '8.8.8.8' });
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
