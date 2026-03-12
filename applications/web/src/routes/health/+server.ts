import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isRedisHealthy } from '$lib/redis-client';
import { instanceIdentifier } from '$lib/instance-identifier';
import { database } from '@template/database';
import { sql } from 'drizzle-orm';
import { environment } from '../../env.js';
import { mcpProtocolVersion } from '$lib/mcp-protocol-constants';

async function isDatabaseHealthy(): Promise<boolean> {
	try {
		await database.execute(sql`select 1`);
		return true;
	} catch {
		return false;
	}
}

function isEnterprisePolicyConfigured(): boolean {
	if (!environment.MCP_ENABLE_ENTERPRISE_AUTH) {
		return true;
	}

	return Boolean(
		environment.ENTERPRISE_AUTH_PROVIDER_URL &&
		environment.ENTERPRISE_AUTH_TENANT &&
		environment.ENTERPRISE_AUTH_AUDIENCE &&
		environment.ENTERPRISE_AUTH_CLIENT_ID &&
		environment.ENTERPRISE_AUTH_CLIENT_SECRET,
	);
}

export const GET: RequestHandler = async () => {
	const redisHealthy = await isRedisHealthy();
	const databaseHealthy = await isDatabaseHealthy();
	const enterprisePolicyConfigured = isEnterprisePolicyConfigured();

	const status = redisHealthy && databaseHealthy && enterprisePolicyConfigured ? 'ok' : 'degraded';

	return json(
		{
			status,
			instanceIdentifier,
			protocolVersion: mcpProtocolVersion,
			extensions: {
				ui: environment.MCP_ENABLE_UI_EXTENSION,
				oauthClientCredentials: environment.MCP_ENABLE_CLIENT_CREDENTIALS,
				enterpriseManagedAuthorization: environment.MCP_ENABLE_ENTERPRISE_AUTH,
			},
			dependencies: {
				redis: redisHealthy ? 'ok' : 'unavailable',
				database: databaseHealthy ? 'ok' : 'unavailable',
				enterprisePolicyBackend: enterprisePolicyConfigured ? 'ok' : 'unconfigured',
			},
		},
		{ status: status === 'ok' ? 200 : 503 },
	);
};
