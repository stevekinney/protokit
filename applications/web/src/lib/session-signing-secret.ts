import { randomBytes } from 'node:crypto';
import { logger } from '@lostgradient/mcp/logger';
import { environment } from '@web/env';

export type SessionSigningSecretResolution = {
	/**
	 * The one secret every new signature (CSRF token, Google state cookie) is created with.
	 * NOT the session cookie itself: a session cookie is an opaque, random bearer token
	 * (`session-authentication.ts`), validated by looking up its own hash in `user_sessions`,
	 * never signed with this secret. See SECRETS-ROTATION.md's "Ending a session outright"
	 * for how a session is actually revoked.
	 */
	current: string;
	/**
	 * DATA-001 / S-18: the outgoing secret during a rotation's overlap window,
	 * present only while `SESSION_SIGNING_SECRET_PREVIOUS` is set. A value
	 * signed under any entry in this list still verifies; nothing is ever
	 * signed with it going forward. Empty once a rotation's cutover clears
	 * it, at which point a value signed only under the retired secret is
	 * rejected outright — that rejection is acceptance criterion 5's
	 * "rejects retired keys after the cutover."
	 */
	previous: readonly string[];
};

/**
 * Pure resolution logic, taking the raw environment values as parameters
 * rather than reading `@web/env` directly, so `session-signing-secret.test.ts`
 * can exercise the full rotation-overlap/cutover state machine (current-only,
 * current+previous accepting both, previous cleared rejecting the retired
 * value) without needing to reload the `@web/env` module between states —
 * the same reason `client-metadata-documents.ts` and
 * `authorization-transaction.ts` structure their own logic around injected
 * values instead of a module-level singleton.
 */
export function resolveSessionSigningSecrets(input: {
	sessionSigningSecret: string | undefined;
	sessionSigningSecretPrevious: string | undefined;
	nodeEnvironment: string | undefined;
	generateFallback?: () => string;
}): SessionSigningSecretResolution {
	if (input.sessionSigningSecret) {
		return {
			current: input.sessionSigningSecret,
			previous: input.sessionSigningSecretPrevious ? [input.sessionSigningSecretPrevious] : [],
		};
	}

	if (input.nodeEnvironment === 'production') {
		throw new Error(
			'SESSION_SIGNING_SECRET is required in production. Generate one with: openssl rand -hex 32',
		);
	}

	const generate = input.generateFallback ?? (() => randomBytes(32).toString('hex'));
	const generated = generate();
	logger.warn(
		'SESSION_SIGNING_SECRET not set — using auto-generated secret. Sessions will not survive restarts.',
	);
	// A generated fallback has no prior deployed value to carry an overlap
	// window for — `SESSION_SIGNING_SECRET_PREVIOUS` is ignored in this
	// branch rather than trusted, since it would otherwise let an unrelated
	// leftover environment variable widen the accepted-signature set beyond
	// what this process itself ever signs with.
	return { current: generated, previous: [] };
}

const resolved = resolveSessionSigningSecrets({
	sessionSigningSecret: environment.sessionSigningSecret,
	sessionSigningSecretPrevious: environment.sessionSigningSecretPrevious,
	nodeEnvironment: environment.nodeEnv,
});

/** Signs with this value. Never used to verify a value signed by anything else. */
export const sessionSigningSecret: string = resolved.current;

/**
 * Every secret a signature is allowed to verify against: the current secret
 * first, then any secret still inside its rotation overlap window. Signing
 * always uses `sessionSigningSecret` (index 0) only.
 */
export const sessionSigningSecrets: readonly string[] = [resolved.current, ...resolved.previous];
