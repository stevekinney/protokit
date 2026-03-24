import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';

const DEVELOPMENT_USER_EMAIL = 'dev@localhost';
const DEVELOPMENT_USER_NAME = 'Development User';

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

async function seedOauthClient(serviceAccountUserId: string): Promise<{
	clientId: string;
	clientSecret: string;
}> {
	const clientId = `seed-client-${randomUUID()}`;
	const clientSecret = randomBytes(32).toString('hex');
	const clientSecretHash = hashCredential(clientSecret);

	const [existing] = await database
		.select({ clientId: schema.oauthClients.clientId })
		.from(schema.oauthClients)
		.where(eq(schema.oauthClients.serviceAccountUserId, serviceAccountUserId))
		.limit(1);

	if (existing) {
		logger.info({ clientId: existing.clientId }, 'OAuth client for service account already exists');
		return {
			clientId: existing.clientId,
			clientSecret: '(already created — secret not retrievable)',
		};
	}

	await database.insert(schema.oauthClients).values({
		clientId,
		clientSecret: clientSecretHash,
		clientName: 'Seed Test Client',
		clientType: 'confidential',
		tokenEndpointAuthMethod: 'client_secret_post',
		serviceAccountUserId,
		redirectUris: ['http://localhost:9999/callback'],
		grantTypes: ['client_credentials'],
		responseTypes: [],
	});

	logger.info({ clientId }, 'Created OAuth client');
	return { clientId, clientSecret };
}

async function main() {
	const userId = await seedDevelopmentUser();
	const { clientId, clientSecret } = await seedOauthClient(userId);

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
