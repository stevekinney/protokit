import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';

const DEVELOPMENT_USER_EMAIL = 'dev@localhost';
const DEVELOPMENT_USER_NAME = 'Development User';
const SEED_CLIENT_NAME = 'Seed Test Client';

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

async function seedOauthClient(): Promise<{
	clientId: string;
	clientSecret: string;
}> {
	const clientId = `seed-client-${randomUUID()}`;
	const clientSecret = randomBytes(32).toString('hex');
	const clientSecretHash = hashCredential(clientSecret);

	const [existing] = await database
		.select({ clientId: schema.oauthClients.clientId })
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.clientName, SEED_CLIENT_NAME))
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
	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: clientSecretHash,
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

async function main() {
	const userId = await seedDevelopmentUser();
	const { clientId, clientSecret } = await seedOauthClient();

	console.log('\n=== Seed Complete ===\n');
	console.log(`Development User: ${DEVELOPMENT_USER_EMAIL} (${userId})`);
	console.log(`OAuth Client ID: ${clientId}`);
	console.log(`OAuth Client Secret: ${clientSecret}`);
	console.log('');

	process.exit(0);
}

main().catch((error) => {
	logger.error({ err: error }, 'Seed script failed');
	process.exit(1);
});
