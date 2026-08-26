import { logger } from '@template/mcp/logger';
import { handleApplicationRequest } from '@web/application';
import { environment } from '@web/env';
import { loadAssetManifest, type AssetManifest } from '@web/lib/asset-manifest';
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
	 * The resolved asset manifest, so a host serving these files itself knows
	 * the exact hashed paths the rendered HTML will reference. Without this a
	 * host would have to re-read `public/assets/manifest.json` by hand to
	 * discover what it is expected to publish.
	 */
	assetManifest: AssetManifest;
	/**
	 * Releases everything the mount started. Safe to call from more than one
	 * shutdown path: concurrent callers all await the same teardown, and
	 * repeat calls after it finishes are no-ops.
	 *
	 * Disposal is permanent for the process. See `createApplicationMount`.
	 */
	dispose(): Promise<void>;
};

export type ApplicationMountOptions = {
	/**
	 * Whether the mount should also serve this application's own generated
	 * assets (`/assets/*`, `/favicon.png`). Defaults to `false`, because a
	 * host normally publishes them through its own static pipeline.
	 *
	 * The default is not a safe thing to ignore: rendered HTML references the
	 * hash-named files `build.ts` emits into `applications/web/public/assets`,
	 * and a host's own static pipeline does not contain that directory
	 * automatically. A host must therefore either copy those files into
	 * whatever it serves at `/assets/*`, or set this to `true` and let the
	 * mount serve them. Doing neither renders unstyled pages that never
	 * hydrate -- with a 404 for each asset as the only clue.
	 */
	serveStaticAssets?: boolean;
};

/**
 * Disposal tears down module-scoped state that only initializes once, at
 * `mcp-handler.ts` module evaluation: `closeAll()` clears the user-handler
 * idle-eviction timer, and disconnecting the Redis subscriber leaves
 * `subscribeToGrantRevocations`'s `redisSubscriptionStarted` latch set, so
 * it never re-subscribes. A second mount in the same process would
 * therefore run with no idle eviction and no cross-replica grant
 * revocation -- both silent. Rather than reach into those modules to make
 * them restartable (they are shared with `server.ts`, which has no such
 * need), disposal is permanent and remounting is refused outright.
 */
let disposedInThisProcess = false;

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
 *
 * Disposal is permanent for the life of the process -- calling this again
 * after `dispose()` throws rather than returning a mount whose background
 * state is silently missing.
 */
export async function createApplicationMount(
	options: ApplicationMountOptions = {},
): Promise<ApplicationMount> {
	if (disposedInThisProcess) {
		throw new Error(
			'createApplicationMount() cannot be called after dispose(): tearing the mount down ' +
				'permanently clears module-scoped MCP transport state that only initializes once ' +
				'per process. Start a new process instead.',
		);
	}

	assertProductionStartupInvariants();

	const assetManifest = await loadAssetManifest();

	startScheduledCleanup(environment.SCHEDULED_CLEANUP_INTERVAL_SECONDS * 1000);

	const serveStaticAssets = options.serveStaticAssets ?? false;

	// One shared promise, not a boolean: a boolean flipped before the first
	// `await` lets a second concurrent caller observe "already disposed" and
	// return while transport and Redis teardown is still running -- so a host
	// awaiting that second call could terminate and drop active streams
	// mid-drain. Every caller awaits this same teardown instead.
	let disposal: Promise<void> | undefined;

	async function runDisposal(): Promise<void> {
		disposedInThisProcess = true;

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
	}

	return {
		assetManifest,

		handleRequest(request, input) {
			return handleApplicationRequest(request, {
				clientAddress: input?.clientAddress,
				serveStaticAssets,
			});
		},

		dispose() {
			disposal ??= runDisposal();
			return disposal;
		},
	};
}

/**
 * Test seam: disposal is deliberately permanent per process, which a test
 * file exercising more than one mount would otherwise trip over on its
 * second `createApplicationMount()`. Never call this from application code.
 */
export const applicationMountTestHooks = {
	resetDisposedState(): void {
		disposedInThisProcess = false;
	},
};
