import { logger } from '@template/mcp/logger';
import { runScheduledCleanup } from '@template/web/lib/scheduled-cleanup';

/**
 * DATA-001 / S-18: manual or externally-cron-scheduled entry point for the
 * same bounded, batched sweep `server.ts` runs on an in-process interval
 * (`SCHEDULED_CLEANUP_INTERVAL_SECONDS`). Useful for a deployment that runs
 * cleanup as a one-shot job rather than keeping a long-lived process alive,
 * or for an operator who wants to run a sweep on demand.
 */
async function main(): Promise<void> {
	const cleanupLogger = logger.child({ script: 'cleanup-expired-data' });
	const result = await runScheduledCleanup();
	cleanupLogger.info({ result }, 'Manual cleanup sweep completed');
}

if (import.meta.main) {
	main()
		.then(() => process.exit(0))
		.catch((error: unknown) => {
			logger.error({ err: error }, 'Cleanup failed');
			process.exit(1);
		});
}
