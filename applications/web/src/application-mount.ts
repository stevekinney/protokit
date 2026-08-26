import { logger } from '@template/mcp/logger';
import { handleApplicationRequest } from '@web/application';
import { environment } from '@web/env';
import { loadAssetManifest } from '@web/lib/asset-manifest';
import { shutdownMcpTransports } from '@web/lib/mcp-handler';
import { getRedisClient, isRedisConfigured } from '@web/lib/redis-client';
import { startScheduledCleanup, stopScheduledCleanup } from '@web/lib/scheduled-cleanup';
import { assertProductionStartupInvariants } from '@web/lib/startup-invariants';

/**
 * What a host gets back from {@link createApplicationMount}. Deliberately
 * not a bare request handler: `server.ts` does four things besides
 * dispatching requests, and an embedding host that only received the
 * dispatcher would silently skip every one of them.
 */
export type ApplicationMount = {
	/**
	 * Dispatches one request. `clientAddress` is per-request state the host
	 * owns (`Bun.serve`'s `server.requestIP(request)`, a SvelteKit host's
	 * `event.getClientAddress()`), which is why it lives here rather than on
	 * the factory -- it is never known at mount time.
	 */
	handleRequest(request: Request, input?: { clientAddress?: string }): Promise<Response>;
	/**
	 * Releases everything the mount started. Idempotent, so a host may call
	 * it from more than one shutdown path without guarding.
	 */
	dispose(): Promise<void>;
};

/**
 * The seam a host application (a SvelteKit hook, a Bun server that owns its
 * own static file serving) uses to mount this application's dynamic routes
 * -- OAuth, MCP, health, everything `application.ts` dispatches -- without
 * also inheriting its static-asset serving. A host that embeds this
 * application already has its own answer for `/assets/*` and `/favicon.png`
 * (its own bundler output, its own CDN); letting both sides try to serve the
 * same paths is exactly the double-serving this seam exists to avoid.
 *
 * This is an async *lifecycle*, not a handler factory, because `server.ts`
 * -- the only other runtime entry point -- performs work at startup that
 * request dispatch alone does not, and every piece of it is load-bearing for
 * an embedded deployment just as much as a standalone one:
 *
 *   - `assertProductionStartupInvariants()` is what refuses to boot a
 *     production process with insecure database transport, a missing Redis
 *     URL, absent trusted-proxy configuration, or an invalid `BASE_URL`.
 *     Skipping it lets an embedded production deployment start in exactly
 *     the configurations the standalone server explicitly rejects.
 *   - `loadAssetManifest()` populates the cache `getAssetManifest()` reads.
 *     Without it that accessor falls back to the unhashed development paths
 *     (`/assets/application.css`, `/assets/client.js`) while `build.ts`
 *     publishes only hash-named files -- so the consent and legal pages
 *     render unstyled and the home page cannot hydrate, with no error
 *     anywhere to explain why.
 *   - `startScheduledCleanup()` is the only in-process sweep of expired
 *     authorization codes, tokens, authorization transactions, and revoked
 *     sessions. Without it those rows accumulate indefinitely.
 *
 * `dispose()` mirrors `server.ts`'s `gracefulShutdown` for the parts a host
 * cannot reach on its own: a `subscriptions/listen` response stays open
 * until `shutdownMcpTransports()` closes it, and the Redis client holds a
 * live connection. A host that restarts without calling `dispose()` drops
 * active MCP streams rather than draining them.
 *
 * The host still owns its own socket: this mount never binds a port, never
 * installs a signal handler, and never calls `process.exit`. Draining
 * in-flight requests before `dispose()` is the host's responsibility,
 * because only the host knows when its own server has stopped accepting
 * them.
 */
export async function createApplicationMount(): Promise<ApplicationMount> {
	assertProductionStartupInvariants();

	await loadAssetManifest();

	startScheduledCleanup(environment.SCHEDULED_CLEANUP_INTERVAL_SECONDS * 1000);

	let disposed = false;

	return {
		handleRequest(request, input) {
			return handleApplicationRequest(request, {
				clientAddress: input?.clientAddress,
				serveStaticAssets: false,
			});
		},

		async dispose() {
			if (disposed) return;
			disposed = true;

			stopScheduledCleanup();
			await shutdownMcpTransports();

			if (isRedisConfigured()) {
				try {
					const redisClient = await getRedisClient();
					await redisClient.quit();
				} catch (error) {
					// Mirrors `server.ts`: Redis may already be disconnected, and a
					// failure to close it must not prevent the rest of teardown.
					logger.warn({ err: error }, 'Redis connection close failed during mount disposal');
				}
			}
		},
	};
}
