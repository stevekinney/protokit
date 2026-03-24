import { sql } from 'drizzle-orm';
import { database } from '@template/database';
import { environment } from '@web/env';
import { jsonResponse } from '@web/lib/http-response';
import { instanceIdentifier } from '@web/lib/instance-identifier';
import { mcpProtocolVersion } from '@web/lib/mcp-protocol-constants';
import { isRedisConfigured, isRedisHealthy } from '@web/lib/redis-client';

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

export async function handleHealthGet(): Promise<Response> {
	const redisConfigured = isRedisConfigured();
	const redisHealthy = redisConfigured ? await isRedisHealthy() : false;
	const databaseHealthy = await isDatabaseHealthy();
	const enterprisePolicyConfigured = isEnterprisePolicyConfigured();

	const degradedDependencies =
		(redisConfigured && !redisHealthy) || !databaseHealthy || !enterprisePolicyConfigured;
	const status = degradedDependencies ? 'degraded' : 'ok';

	let redisStatus: 'ok' | 'unavailable' | 'not_configured';
	if (!redisConfigured) {
		redisStatus = 'not_configured';
	} else {
		redisStatus = redisHealthy ? 'ok' : 'unavailable';
	}

	return jsonResponse(
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
				redis: redisStatus,
				database: databaseHealthy ? 'ok' : 'unavailable',
				enterprisePolicyBackend: enterprisePolicyConfigured ? 'ok' : 'unconfigured',
			},
		},
		{ status: status === 'ok' ? 200 : 503 },
	);
}
