import { sql } from 'drizzle-orm';
import { database } from '@template/database';
import { environment } from '@web/env';
import { jsonResponse } from '@web/lib/http-response';
import { instanceIdentifier } from '@web/lib/instance-identifier';
import { mcpSupportedProtocolVersions } from '@web/lib/mcp-protocol-constants';
import { createRateLimitedResponse } from '@web/lib/rate-limit-response';
import type { RequestContext } from '@web/lib/request-context';
import { enforceHealthProbeRateLimit } from '@web/lib/request-rate-limiter';
import { isRedisConfigured, isRedisHealthy } from '@web/lib/redis-client';

async function isDatabaseHealthy(): Promise<boolean> {
	try {
		await database.execute(sql`select 1`);
		return true;
	} catch {
		return false;
	}
}

export async function handleHealthGet(context: RequestContext): Promise<Response> {
	const rateLimitResult = await enforceHealthProbeRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds);
	}

	const redisConfigured = isRedisConfigured();
	const redisHealthy = redisConfigured ? await isRedisHealthy() : false;
	const databaseHealthy = await isDatabaseHealthy();

	const degradedDependencies = (redisConfigured && !redisHealthy) || !databaseHealthy;
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
			protocolVersions: mcpSupportedProtocolVersions,
			extensions: {
				ui: environment.MCP_ENABLE_UI_EXTENSION,
			},
			dependencies: {
				redis: redisStatus,
				database: databaseHealthy ? 'ok' : 'unavailable',
			},
		},
		{ status: status === 'ok' ? 200 : 503 },
	);
}
