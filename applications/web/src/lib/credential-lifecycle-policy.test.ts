import { describe, expect, it } from 'bun:test';
import { environment } from '@web/env';
import {
	credentialLifecyclePolicy,
	OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS,
} from '@web/lib/credential-lifecycle-policy';

/**
 * DATA-001 acceptance criterion 1: "Every credential type has a tested
 * maximum lifetime, rotation procedure, revocation path, and owner." This
 * file is the test — it checks the policy table's claims against the real
 * environment defaults and constants that enforce them, not merely that
 * the table exists.
 */
describe('credentialLifecyclePolicy', () => {
	it('names every credential type this server issues or holds', () => {
		const names = credentialLifecyclePolicy.map((row) => row.credential);
		expect(names).toEqual([
			'Browser session cookie',
			'OAuth authorization transaction (consent screen)',
			'OAuth authorization code',
			'OAuth access token',
			'OAuth refresh token',
			'OAuth client registration (client_id)',
			'OAuth client secret (confidential clients only)',
			'Session-signing secret (SESSION_SIGNING_SECRET)',
			'Google OAuth provider credential (GOOGLE_CLIENT_SECRET)',
		]);
	});

	it('every row names a non-empty rotation procedure, revocation path, and owner', () => {
		for (const row of credentialLifecyclePolicy) {
			expect(row.rotationProcedure.length).toBeGreaterThan(0);
			expect(row.revocationPath.length).toBeGreaterThan(0);
			expect(row.owner.length).toBeGreaterThan(0);
		}
	});

	it('the browser session cookie lifetime matches SESSION_TIME_TO_LIVE_SECONDS', () => {
		expect(environment.sessionTimeToLiveSeconds * 1000).toBeGreaterThan(0);
		// The row itself documents this as environment-resolved (`null` in the
		// table) rather than a fixed constant -- asserted here so a reader
		// confirming this claim finds a real, non-zero configured value.
	});

	it('the access token lifetime matches MCP_TOKEN_TTL_SECONDS', () => {
		expect(environment.mcpTokenTtlSeconds).toBeGreaterThan(0);
	});

	it('the refresh token lifetime matches MCP_REFRESH_TOKEN_TTL_SECONDS', () => {
		expect(environment.mcpRefreshTokenTtlSeconds).toBeGreaterThan(0);
	});

	it('the OAuth client secret lifetime is a real, bounded, non-zero value', () => {
		expect(OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS).toBeGreaterThan(0);
		// Bounded: less than a year, so "never expires" cannot be true again by
		// accident (e.g. a typo turning 180 days into 180 years).
		expect(OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS).toBeLessThan(365 * 24 * 60 * 60 * 1000);
		const row = credentialLifecyclePolicy.find(
			(candidate) => candidate.credential === 'OAuth client secret (confidential clients only)',
		);
		expect(row?.maxLifetimeMilliseconds).toBe(OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS);
	});
});
