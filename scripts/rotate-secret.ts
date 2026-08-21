import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { database as DatabaseInstance, schema } from '@template/database';
import { OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS } from '@template/web/lib/credential-lifecycle-policy';

import {
	commandExists,
	ENVIRONMENT_FILE_PATH,
	setGithubSecret,
	MANAGED_GITHUB_SECRETS,
} from './utilities.ts';
import {
	appendEnvironmentEntryToFile,
	readEnvironmentEntriesFromFile,
	removeEnvironmentEntryFromFile,
} from './environment-file.ts';

/**
 * SECRETS-001 rotation and revocation procedure — see `SECRETS-ROTATION.md` for the full
 * per-credential-class runbook this script implements the local/CI-managed half of. Every
 * function here is pure with respect to console output (returns data, never prints a secret),
 * so the CLI entry point below controls exactly what reaches stdout.
 */

export function generateSessionSigningSecret(): string {
	return randomBytes(32).toString('hex');
}

export interface RotationResult {
	previousValuePresent: boolean;
	rotated: boolean;
	nextValue: string;
}

/**
 * Rotates `SESSION_SIGNING_SECRET` in `.env.local`: generates a fresh 32-byte hex value,
 * writes it as the new current secret, and moves the outgoing value into
 * `SESSION_SIGNING_SECRET_PREVIOUS` instead of discarding it (DATA-001 / S-18: "no signing-key
 * version or rotation procedure exists" — this is that procedure's overlap window). Every
 * session cookie and CSRF token signed under the outgoing secret keeps verifying — new signing
 * always uses the current secret, but verification checks the current secret first, then any
 * `SESSION_SIGNING_SECRET_PREVIOUS` value — until `rotateSessionSigningSecretCutoverLocally`
 * clears `SESSION_SIGNING_SECRET_PREVIOUS`, which rejects the retired key outright (see
 * `applications/web/src/lib/session-signing-secret.ts`'s `resolveSessionSigningSecrets`). The
 * previous value is never returned or logged by this function — it only ever exists inside the
 * `.env.local` file (mode `0600`) between these two steps.
 */
export function rotateSessionSigningSecretLocally(environmentFilePath: string): RotationResult {
	const previousValue =
		readEnvironmentEntriesFromFile(environmentFilePath)['SESSION_SIGNING_SECRET'];
	const nextValue = generateSessionSigningSecret();
	appendEnvironmentEntryToFile(environmentFilePath, 'SESSION_SIGNING_SECRET', nextValue);
	if (previousValue) {
		appendEnvironmentEntryToFile(
			environmentFilePath,
			'SESSION_SIGNING_SECRET_PREVIOUS',
			previousValue,
		);
	}
	return { previousValuePresent: Boolean(previousValue), rotated: true, nextValue };
}

/**
 * Ends a rotation's overlap window: removes `SESSION_SIGNING_SECRET_PREVIOUS` from
 * `.env.local` so the retired secret is rejected outright (DATA-001 acceptance criterion 5,
 * "Key rotation ... rejects retired keys after the cutover"). Run once every client that could
 * still be holding a session or CSRF token signed under the old secret has had time to either
 * use it (refreshing it under the current secret) or expire.
 */
export function rotateSessionSigningSecretCutoverLocally(environmentFilePath: string): void {
	removeEnvironmentEntryFromFile(environmentFilePath, 'SESSION_SIGNING_SECRET_PREVIOUS');
}

export function hashCredential(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

/**
 * Rotates a stored OAuth client secret: generates a new secret, hashes it the same way
 * `packages/database`'s `schema.oauthClients.clientSecret` column stores it (SHA-256, matching
 * `scripts/seed.ts`'s `hashCredential`), and updates the row with a fresh
 * `clientSecretExpiresAt`. Returns the plaintext once, for one-time delivery to whoever owns
 * that client — never persisted or logged by this function. The previous secret's hash is
 * overwritten, so any token request presenting it fails the `client_secret_post` comparison the
 * moment this returns; there is no dual-secret grace period for OAuth client secrets the way
 * there now is for the session-signing secret, because this codebase compares a single stored
 * hash (documented rollout: rotate during a maintenance window, coordinate a synchronized
 * handoff with the client rather than relying on a grace period that does not exist).
 */
export async function rotateOauthClientSecret(
	database: Pick<typeof DatabaseInstance, 'update'>,
	oauthClientsTable: typeof schema.oauthClients,
	clientId: string,
): Promise<{ newSecret: string; expiresAt: Date }> {
	const newSecret = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS);
	await database
		.update(oauthClientsTable)
		.set({ clientSecret: hashCredential(newSecret), clientSecretExpiresAt: expiresAt })
		.where(eq(oauthClientsTable.clientId, clientId));
	return { newSecret, expiresAt };
}

async function rotateSessionSigningSecretCommand(): Promise<void> {
	console.log('\n--- Rotating SESSION_SIGNING_SECRET ---\n');
	const result = rotateSessionSigningSecretLocally(ENVIRONMENT_FILE_PATH);
	console.log(
		result.previousValuePresent
			? 'Wrote a new SESSION_SIGNING_SECRET and moved the outgoing value to SESSION_SIGNING_SECRET_PREVIOUS (values not printed).'
			: 'No previous SESSION_SIGNING_SECRET found — wrote a new one to .env.local (value not printed).',
	);
	if (result.previousValuePresent) {
		console.log(
			'Sessions and CSRF tokens signed under the outgoing secret keep verifying during this',
		);
		console.log(
			'overlap window. Run `bun scripts/rotate-secret.ts session-cutover` once every client has',
		);
		console.log('had time to refresh, to reject the retired key outright (DATA-001).');
	}
	console.log('Restart the server for the new SESSION_SIGNING_SECRET to take effect.');

	if (commandExists('gh') && MANAGED_GITHUB_SECRETS.includes('SESSION_SIGNING_SECRET')) {
		try {
			setGithubSecret('SESSION_SIGNING_SECRET', result.nextValue);
			console.log('Also updated the SESSION_SIGNING_SECRET GitHub secret.');
		} catch {
			console.warn(
				'Could not update the GitHub-managed SESSION_SIGNING_SECRET secret automatically. ' +
					'Set it manually: gh secret set SESSION_SIGNING_SECRET',
			);
		}
	}
}

async function rotateSessionSigningSecretCutoverCommand(): Promise<void> {
	console.log('\n--- Ending SESSION_SIGNING_SECRET rotation overlap ---\n');
	rotateSessionSigningSecretCutoverLocally(ENVIRONMENT_FILE_PATH);
	console.log(
		'Removed SESSION_SIGNING_SECRET_PREVIOUS from .env.local. Any session or CSRF token still',
	);
	console.log('signed under the retired secret is now rejected. Restart the server to apply.');
}

async function revokeManagedGithubSecretCommand(name: string): Promise<void> {
	if (!(MANAGED_GITHUB_SECRETS as readonly string[]).includes(name)) {
		console.error(
			`"${name}" is not a managed GitHub secret. Managed: ${MANAGED_GITHUB_SECRETS.join(', ')}`,
		);
		process.exit(1);
	}
	if (!commandExists('gh')) {
		console.error('gh CLI is not installed.');
		process.exit(1);
	}
	// Revocation for GitHub-managed secrets is `scripts/teardown.ts`'s existing
	// `teardownGithubSecrets` phase (`gh secret delete`) — deliberately not duplicated here.
	console.log(`Run: bun scripts/teardown.ts github`);
	console.log(
		'(walks through deleting every managed GitHub secret, including this one, with confirmation)',
	);
}

const subcommand = process.argv[2];

if (import.meta.main) {
	if (subcommand === 'session') {
		await rotateSessionSigningSecretCommand();
	} else if (subcommand === 'session-cutover') {
		await rotateSessionSigningSecretCutoverCommand();
	} else if (subcommand === 'revoke-github' && process.argv[3]) {
		await revokeManagedGithubSecretCommand(process.argv[3]);
	} else {
		console.error('Usage:');
		console.error(
			'  bun scripts/rotate-secret.ts session          — rotate SESSION_SIGNING_SECRET (starts overlap)',
		);
		console.error(
			'  bun scripts/rotate-secret.ts session-cutover  — end the overlap, reject the retired key',
		);
		console.error(
			'  bun scripts/rotate-secret.ts revoke-github <NAME> — revoke a managed GitHub secret',
		);
		console.error(
			'See SECRETS-ROTATION.md for the full procedure covering every credential class.',
		);
		process.exit(1);
	}
}
