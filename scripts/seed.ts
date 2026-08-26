import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';
import { OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS } from '@template/web/lib/credential-lifecycle-policy';

import { writeSecretFileAtomic, ROOT_DIRECTORY } from './utilities.ts';

const DEVELOPMENT_USER_EMAIL = 'dev@localhost';
const DEVELOPMENT_USER_NAME = 'Development User';
const SEED_CLIENT_NAME = 'Seed Test Client';
// A fixed, well-known clientId (rather than the freely chosen, non-unique
// `clientName`) so idempotency is keyed off the actual unique primary key.
// Real client registrations never collide with this: DCR (`oauth-routes.ts`)
// mints a bare `randomUUID()`, and a Client ID Metadata Document's clientId is
// the HTTPS URL it was fetched from -- neither can ever equal this literal.
export const SEED_CLIENT_ID = 'seed-client';

function hashCredential(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

async function seedDevelopmentUser(): Promise<string> {
	const [existing] = await database
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.email, DEVELOPMENT_USER_EMAIL))
		.limit(1);

	if (existing) {
		logger.info({ userId: existing.id }, 'Development user already exists');
		return existing.id;
	}

	const userId = randomUUID();
	await database.insert(schema.users).values({
		id: userId,
		email: DEVELOPMENT_USER_EMAIL,
		name: DEVELOPMENT_USER_NAME,
		emailVerified: true,
		role: 'user',
	});

	logger.info({ userId }, 'Created development user');
	return userId;
}

/**
 * `clientId` defaults to the fixed `SEED_CLIENT_ID` for the real `bun db:seed` path.
 * Overridable purely so `seed.integration.test.ts` can prove the keying behavior with a
 * per-run, `randomUUID()`-derived id instead of racing concurrent suites on the one shared
 * `'seed-client'` primary-key row (concurrent full-suite runs are this branch's standing
 * verification pattern -- see OPEN-7 in PROGRESS.local.md for what happens when a shared
 * fixture row isn't isolated per run).
 */
export async function seedOauthClient(clientId: string = SEED_CLIENT_ID): Promise<{
	clientId: string;
	clientSecret: string;
}> {
	const clientSecret = randomBytes(32).toString('hex');
	const clientSecretHash = hashCredential(clientSecret);

	// Looked up by the fixed, unique clientId rather than the freely chosen
	// `clientName` -- `clientName` is neither unique nor reserved, so an
	// unrelated client (a coincidental registration, or an untrusted DCR
	// caller deliberately choosing this display name) could otherwise be
	// mistaken for the seed client and returned in its place.
	const [existing] = await database
		.select({ clientId: schema.oauthClients.clientId })
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientId, clientId))
		.limit(1);

	if (existing) {
		logger.info({ clientId: existing.clientId }, 'Seed OAuth client already exists');
		return {
			clientId: existing.clientId,
			clientSecret: '(already created — secret not retrievable)',
		};
	}

	// Registered with the interactive authorization_code + refresh_token grants that
	// Claude, Codex, and ChatGPT connectors use. client_credentials is not a supported
	// grant on this server — see SEC-001.
	const clientSecretExpiresAt = new Date(Date.now() + OAUTH_CLIENT_SECRET_LIFETIME_MILLISECONDS);
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: clientSecretHash,
		clientSecretExpiresAt,
		clientName: SEED_CLIENT_NAME,
		clientType: 'confidential',
		tokenEndpointAuthMethod: 'client_secret_post',
		redirectUris: ['http://localhost:9999/callback'],
		grantTypes: ['authorization_code', 'refresh_token'],
		responseTypes: ['code'],
	});

	logger.info({ clientId }, 'Created OAuth client');
	return { clientId, clientSecret };
}

export const ALREADY_CREATED_MARKER = '(already created — secret not retrievable)';

/**
 * SECRETS-001 (S-12): the plaintext secret used to be printed straight to stdout, where it
 * would sit in terminal scrollback, a recorded session, or CI logs indefinitely. It exists
 * nowhere else — the database stores only its hash — so the one-time delivery still has to
 * happen somewhere; a 0600 file next to `.env.local` (already git- and docker-ignored) is that
 * somewhere instead of a log stream. Nothing that isn't already an OAuth client secret gets
 * weaker: an attacker who can read this file could already read `.env.local` sitting right next
 * to it. Returns the message to print — never the secret itself.
 */
export function deliverSeedClientSecret(secretFilePath: string, clientSecret: string): string {
	if (clientSecret === ALREADY_CREATED_MARKER) {
		return `OAuth Client Secret: ${ALREADY_CREATED_MARKER}`;
	}

	writeSecretFileAtomic(secretFilePath, `${clientSecret}\n`);
	return [
		`OAuth Client Secret: written to ${secretFilePath} (mode 0600, not printed)`,
		'Read it once and delete the file — it is not retrievable from the database.',
	].join('\n');
}

async function main() {
	const userId = await seedDevelopmentUser();
	const { clientId, clientSecret } = await seedOauthClient();

	console.log('\n=== Seed Complete ===\n');
	console.log(`Development User: ${DEVELOPMENT_USER_EMAIL} (${userId})`);
	console.log(`OAuth Client ID: ${clientId}`);
	console.log(
		deliverSeedClientSecret(join(ROOT_DIRECTORY, '.env.local.seed-client-secret'), clientSecret),
	);
	console.log('');

	process.exit(0);
}

if (import.meta.main) {
	main().catch((error) => {
		logger.error({ err: error }, 'Seed script failed');
		process.exit(1);
	});
}
