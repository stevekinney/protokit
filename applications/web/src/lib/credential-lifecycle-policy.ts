/**
 * DATA-001 / S-18: "Define lifetimes, rotation overlap, revocation
 * triggers, and owner-visible inventory for browser sessions, authorization
 * transactions, codes, access tokens, refresh-token families, client
 * registrations, client secrets, signing keys, and provider credentials."
 *
 * This is the single declarative source of truth that statement asks for —
 * one row per credential type this server issues or holds, naming its
 * actual enforced maximum lifetime, its rotation procedure, and its
 * revocation path. `credential-lifecycle-policy.test.ts` asserts every row's
 * `maxLifetimeMilliseconds` against the real constant or environment
 * default that enforces it, so this table cannot silently drift from the
 * code that actually implements each lifetime — a stale doc comment making
 * a claim nothing checks is exactly the "server claims a security property
 * it does not enforce" failure `META-001`/`S-20` names elsewhere in this
 * roadmap.
 *
 * Exported from `applications/web` (via the `./lib/credential-lifecycle-policy`
 * package export) so `scripts/rotate-secret.ts` -- a root-level script, not
 * a workspace package -- can import the same constants it rotates against
 * instead of maintaining a second copy that could drift.
 */

/** DATA-001 acceptance criterion 5 / S-18: a confidential OAuth client secret's maximum lifetime before `authenticateOauthClient` rejects it outright. Enforced in `applications/web/src/routes/oauth-routes.tsx`. */
export const OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS = 180 * 24 * 60 * 60 * 1000;

export type CredentialLifecyclePolicyRow = {
	credential: string;
	/** `null` means this credential type has no server-enforced maximum lifetime of its own — it lives only as long as the identity or grant it depends on, revoked with that dependency. */
	maxLifetimeMilliseconds: number | null;
	rotationProcedure: string;
	revocationPath: string;
	owner: string;
};

export const credentialLifecyclePolicy: readonly CredentialLifecyclePolicyRow[] = [
	{
		credential: 'Browser session cookie',
		maxLifetimeMilliseconds: null, // resolved from environment.SESSION_TIME_TO_LIVE_SECONDS at runtime; see the policy test.
		rotationProcedure:
			'None — a session is a bearer credential re-issued on every sign-in, not rotated in place.',
		revocationPath:
			'lib/session-authentication.ts revokeSession() (POST /auth/sign-out); lib/account-deletion.ts deleteUserAccount() on account deletion.',
		owner:
			'The signed-in user (self-service via sign-out); an operator via direct database access for incident response.',
	},
	{
		credential: 'OAuth authorization transaction (consent screen)',
		maxLifetimeMilliseconds: 10 * 60 * 1000,
		rotationProcedure: 'None — single-use, consumed atomically by approve/deny.',
		revocationPath:
			'Consumed (marked `consumedAt`) by lib/authorization-transaction.ts consumeAuthorizationTransaction(); scheduled-cleanup.ts deletes expired rows.',
		owner:
			'The signed-in user (implicitly, by approving or denying); the server (enforces the 10-minute window).',
	},
	{
		credential: 'OAuth authorization code',
		maxLifetimeMilliseconds: 10 * 60 * 1000,
		rotationProcedure: 'None — single-use, exchanged once at POST /oauth/token.',
		revocationPath:
			'Consumed (`usedAt` set) on exchange; scheduled-cleanup.ts deletes expired/used rows.',
		owner:
			'The registering client (redeems it); the server (enforces single use and the 10-minute window).',
	},
	{
		credential: 'OAuth access token',
		maxLifetimeMilliseconds: null, // resolved from environment.MCP_TOKEN_TTL_SECONDS at runtime; see the policy test.
		rotationProcedure:
			'Re-minted alongside every refresh-token rotation (POST /oauth/token, grant_type=refresh_token); the prior access token is revoked in the same request.',
		revocationPath:
			'POST /oauth/revoke (client-authenticated); refresh-family revocation on detected replay (revokeOauthRefreshTokenFamily); per-client or account-wide revocation via lib/consent-inventory.ts; deleteUserAccount() on account deletion.',
		owner:
			'The signed-in user (per-client and revoke-all, via the account connections page); the registering client (rotation); the server (expiry, replay detection).',
	},
	{
		credential: 'OAuth refresh token',
		maxLifetimeMilliseconds: null, // resolved from environment.MCP_REFRESH_TOKEN_TTL_SECONDS at runtime; see the policy test.
		rotationProcedure:
			'Single-use rotation on every POST /oauth/token grant_type=refresh_token — the presented token is atomically revoked and a new one issued in the same family (oauth_refresh_tokens.familyId).',
		revocationPath:
			'Same predicate that performs rotation; a replayed (already-revoked) token revokes its entire family (revokeOauthRefreshTokenFamily) plus every live descendant access token; deleteUserAccount() on account deletion.',
		owner:
			'The registering client (each rotation); the server (replay detection revokes the family automatically); the signed-in user (per-client and revoke-all).',
	},
	{
		credential: 'OAuth client registration (client_id)',
		maxLifetimeMilliseconds: null, // no server-enforced expiry — a registration is a standing identity, not a time-bounded grant.
		rotationProcedure:
			'None for the identifier itself — a client re-registers under a new client_id if it wants a clean identity.',
		revocationPath:
			'lib/account-deletion.ts deleteOauthClient() — cascades (onDelete: "cascade" in packages/database/src/schema.ts) into every code, token, refresh token, and authorization transaction naming that client, revoking every currently valid credential immediately. Durable ONLY for a DCR (randomUUID()) client_id. For a Client ID Metadata Document client, deleting the row is not durable: handleOauthAuthorizeGet re-fetches and re-upserts it on the next /oauth/authorize naming the same document URL (deliberate, OAUTH-002) — deleteOauthClient() reports this via its cimdClientMayReauthorize result field rather than silently claiming a complete ban. Durably blocking a CIMD client requires denying its document at the hosting/network layer, outside this application.',
		owner:
			'An operator (no self-service client-deletion HTTP route exists in this template; deleteOauthClient() is available to whoever administers the deployment).',
	},
	{
		credential: 'OAuth client secret (confidential clients only)',
		maxLifetimeMilliseconds: OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS,
		rotationProcedure:
			'scripts/rotate-secret.ts rotateOauthClientSecret() — generates a new secret, hashes and stores it with a fresh expiry; no dual-secret grace period (a single stored hash), so rotation is a coordinated handoff, not a rolling overlap.',
		revocationPath:
			'authenticateOauthClient() rejects a secret past clientSecretExpiresAt; rotation immediately invalidates the outgoing secret by overwriting its hash.',
		owner: 'The developer/operator who owns the client registration, via scripts/rotate-secret.ts.',
	},
	{
		credential: 'Session-signing secret (SESSION_SIGNING_SECRET)',
		maxLifetimeMilliseconds: null, // no server-enforced expiry — an operational secret rotated on an operator-driven schedule, not a per-issuance credential.
		rotationProcedure:
			'scripts/rotate-secret.ts session — issues a new current secret and moves the outgoing value to SESSION_SIGNING_SECRET_PREVIOUS as an overlap window (lib/session-signing-secret.ts resolveSessionSigningSecrets()).',
		revocationPath:
			'scripts/rotate-secret.ts session-cutover — clears SESSION_SIGNING_SECRET_PREVIOUS, after which a CSRF token or Google sign-in state cookie signed only under the retired secret is rejected outright. Does NOT revoke any browser session: session cookies are opaque bearer tokens validated against user_sessions by hash, never signed with this secret (see SECRETS-ROTATION.md "Ending a session outright" for the separate, deliberately manual user_sessions revocation path).',
		owner: 'The operator, via SECRETS-ROTATION.md.',
	},
	{
		credential: 'Google OAuth provider credential (GOOGLE_CLIENT_SECRET)',
		maxLifetimeMilliseconds: null, // set and rotated entirely inside Google Cloud Console; this server has no enforcement lever over it.
		rotationProcedure:
			"Google Cloud Console supports multiple secrets per OAuth client simultaneously; add a new one, roll it out, then delete the old one from the console. Documented in SECRETS-ROTATION.md — this server has no code path that enforces or checks the provider's own secret lifetime.",
		revocationPath: 'Delete the secret in Google Cloud Console.',
		owner: 'The operator, via the Google Cloud Console.',
	},
] as const;
