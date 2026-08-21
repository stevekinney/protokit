import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { database as DatabaseInstance, schema } from '@template/database';

import {
	commandExists,
	ENVIRONMENT_FILE_PATH,
	setGithubSecret,
	MANAGED_GITHUB_SECRETS,
} from './utilities.ts';
import {
	appendEnvironmentEntryToFile,
	readEnvironmentEntriesFromFile,
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
 * Rotates `SESSION_SIGNING_SECRET` in `.env.local`: generates a fresh 32-byte hex value and
 * overwrites the existing entry. The previous value is never returned or logged — once
 * overwritten, it exists only in whatever session cookies were already signed with it, which is
 * exactly the intended effect: every session signed under the old secret stops verifying the
 * instant this secret changes (see `applications/web/src/lib/session-signing-secret.ts` and
 * `csrf-protection.ts`, both keyed directly off this value). That is an intentional, immediate
 * invalidation of every existing session — not a bug — so it should run during a maintenance
 * window, never silently as part of an unrelated deploy.
 */
export function rotateSessionSigningSecretLocally(environmentFilePath: string): RotationResult {
	const previousValue =
		readEnvironmentEntriesFromFile(environmentFilePath)['SESSION_SIGNING_SECRET'];
	const nextValue = generateSessionSigningSecret();
	appendEnvironmentEntryToFile(environmentFilePath, 'SESSION_SIGNING_SECRET', nextValue);
	return { previousValuePresent: Boolean(previousValue), rotated: true, nextValue };
}

export function hashCredential(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

/**
 * Rotates a stored OAuth client secret: generates a new secret, hashes it the same way
 * `packages/database`'s `schema.oauthClients.clientSecret` column stores it (SHA-256, matching
 * `scripts/seed.ts`'s `hashCredential`), and updates the row. Returns the plaintext once, for
 * one-time delivery to whoever owns that client — never persisted or logged by this function.
 * The previous secret's hash is overwritten, so any token request presenting it fails the
 * `client_secret_post` comparison the moment this returns; there is no dual-secret grace period,
 * because this codebase compares a single stored hash (documented rollout: rotate during a
 * maintenance window, coordinate a synchronized handoff with the client rather than relying on a
 * grace period that does not exist).
 */
export async function rotateOauthClientSecret(
	database: Pick<typeof DatabaseInstance, 'update'>,
	oauthClientsTable: typeof schema.oauthClients,
	clientId: string,
): Promise<{ newSecret: string }> {
	const newSecret = randomBytes(32).toString('hex');
	await database
		.update(oauthClientsTable)
		.set({ clientSecret: hashCredential(newSecret) })
		.where(eq(oauthClientsTable.clientId, clientId));
	return { newSecret };
}

async function rotateSessionSigningSecretCommand(): Promise<void> {
	console.log('\n--- Rotating SESSION_SIGNING_SECRET ---\n');
	const result = rotateSessionSigningSecretLocally(ENVIRONMENT_FILE_PATH);
	console.log(
		result.previousValuePresent
			? 'Replaced the existing SESSION_SIGNING_SECRET in .env.local (value not printed).'
			: 'No previous SESSION_SIGNING_SECRET found — wrote a new one to .env.local (value not printed).',
	);
	console.log(
		'Every existing session and CSRF token is now invalid. Restart the server and expect every',
	);
	console.log('signed-in user to be signed out.');

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
	} else if (subcommand === 'revoke-github' && process.argv[3]) {
		await revokeManagedGithubSecretCommand(process.argv[3]);
	} else {
		console.error('Usage:');
		console.error(
			'  bun scripts/rotate-secret.ts session          — rotate SESSION_SIGNING_SECRET',
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
