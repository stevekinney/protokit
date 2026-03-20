import { database, schema } from '@template/database';
import { logger } from '@template/mcp/logger';
import { lt, or, isNotNull } from 'drizzle-orm';

const cleanupLogger = logger.child({ script: 'cleanup-expired-data' });

async function cleanupExpiredData() {
	const now = new Date();
	const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

	// Delete expired or used OAuth authorization codes
	const deletedCodes = await database
		.delete(schema.oauthCodes)
		.where(or(lt(schema.oauthCodes.expiresAt, now), isNotNull(schema.oauthCodes.usedAt)))
		.returning();

	cleanupLogger.info(
		{ count: deletedCodes.length },
		'Deleted expired/used OAuth authorization codes',
	);

	// Delete revoked or expired access tokens
	const deletedTokens = await database
		.delete(schema.oauthTokens)
		.where(or(isNotNull(schema.oauthTokens.revokedAt), lt(schema.oauthTokens.expiresAt, now)))
		.returning();

	cleanupLogger.info({ count: deletedTokens.length }, 'Deleted revoked/expired access tokens');

	// Delete revoked or expired refresh tokens
	const deletedRefreshTokens = await database
		.delete(schema.oauthRefreshTokens)
		.where(
			or(
				isNotNull(schema.oauthRefreshTokens.revokedAt),
				lt(schema.oauthRefreshTokens.expiresAt, now),
			),
		)
		.returning();

	cleanupLogger.info(
		{ count: deletedRefreshTokens.length },
		'Deleted revoked/expired refresh tokens',
	);

	// Delete revoked or expired user sessions
	const deletedSessions = await database
		.delete(schema.userSessions)
		.where(or(isNotNull(schema.userSessions.revokedAt), lt(schema.userSessions.expiresAt, now)))
		.returning();

	cleanupLogger.info({ count: deletedSessions.length }, 'Deleted revoked/expired user sessions');

	// Delete stale MCP session records (inactive for more than 24 hours)
	const deletedMcpSessions = await database
		.delete(schema.mcpSessions)
		.where(lt(schema.mcpSessions.lastActiveAt, oneDayAgo))
		.returning();

	cleanupLogger.info({ count: deletedMcpSessions.length }, 'Deleted stale MCP sessions');
}

cleanupExpiredData()
	.then(() => {
		cleanupLogger.info('Cleanup completed');
		process.exit(0);
	})
	.catch((error) => {
		cleanupLogger.error({ err: error }, 'Cleanup failed');
		process.exit(1);
	});
