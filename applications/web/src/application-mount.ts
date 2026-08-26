import { logger } from '@template/mcp/logger';
import { jsonResponse } from '@web/lib/http-response';
import { handleApplicationRequest } from '@web/application';
import { environment } from '@web/env';
import { loadAssetManifest, type AssetManifest } from '@web/lib/asset-manifest';
import { shutdownMcpTransports } from '@web/lib/mcp-handler';
import { getRedisClient, isRedisConfigured } from '@web/lib/redis-client';
import {
	awaitActiveCleanupSweep,
	startScheduledCleanup,
	stopScheduledCleanup,
} from '@web/lib/scheduled-cleanup';
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
 * One mount per process, tracked as an explicit state machine rather than a
 * pair of booleans, because both illegal transitions are silent failures
 * rather than loud ones.
 *
 * Two *live* mounts would share one set of module-scoped resources -- the
 * cleanup timer, the MCP user-handler cache, the grant-revocation
 * subscriber, the Redis client -- while handing out two independently
 * disposable handles. Disposing either would tear those down under the
 * other, which keeps serving requests with no idle eviction and no
 * cross-replica revocation.
 *
 * Remounting after disposal is equally broken: `closeAll()` clears the
 * user-handler idle-eviction timer for good, and `subscribeToGrantRevocations`
 * early-returns forever because its `redisSubscriptionStarted` latch stays
 * set once the subscriber disconnects. Rather than reach into those modules
 * to make them restartable -- they are shared with `server.ts`, which has no
 * such need -- both transitions are refused outright.
 */
type MountState = 'none' | 'live' | 'disposed';

let mountState: MountState = 'none';

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
 * Exactly one mount may exist per process. Calling this while a mount is
 * live, or after one has been disposed, throws rather than returning a
 * handle whose background state is shared or silently missing. If startup
 * fails, the background state `mcp-handler.ts` established at import is
 * released before the rejection propagates.
 */
export async function createApplicationMount(
	options: ApplicationMountOptions = {},
): Promise<ApplicationMount> {
	if (mountState === 'disposed') {
		throw new Error(
			'createApplicationMount() cannot be called after dispose(): tearing the mount down ' +
				'permanently clears module-scoped MCP transport state that only initializes once ' +
				'per process. Start a new process instead.',
		);
	}
	if (mountState === 'live') {
		throw new Error(
			'createApplicationMount() cannot be called while another mount is live: both mounts ' +
				'would share one cleanup timer, MCP handler cache, grant-revocation subscriber, and ' +
				'Redis client, so disposing either would break the other. Reuse the existing mount.',
		);
	}

	// Claimed synchronously, before the first `await`, so two concurrent
	// callers cannot both pass the checks above and each receive a handle.
	mountState = 'live';

	let assetManifest: AssetManifest;
	try {
		assertProductionStartupInvariants();
		assetManifest = await loadAssetManifest();
		startScheduledCleanup(environment.SCHEDULED_CLEANUP_INTERVAL_SECONDS * 1000);
	} catch (error) {
		// Importing this module already evaluated `mcp-handler.ts`, which starts
		// the user-handler sweep and subscribes to grant revocations at module
		// scope -- so by the time startup fails, background state exists with no
		// handle to release it. A host that catches this rejection and keeps
		// running its own application would otherwise leak a timer and a Redis
		// subscriber for the life of the process.
		await releaseBackgroundState();
		mountState = 'disposed';
		throw error;
	}

	const serveStaticAssets = options.serveStaticAssets ?? false;

	// One shared promise, not a boolean: a boolean flipped before the first
	// `await` lets a second concurrent caller observe "already disposed" and
	// return while transport and Redis teardown is still running -- so a host
	// awaiting that second call could terminate and drop active streams
	// mid-drain. Every caller awaits this same teardown instead.
	let disposal: Promise<void> | undefined;

	async function runDisposal(): Promise<void> {
		mountState = 'disposed';
		stopScheduledCleanup();
		// Clearing the interval only stops future ticks. A sweep already
		// running is a detached task still issuing database mutations, and
		// resolving `dispose()` out from under it would let the host tear down
		// connections mid-write.
		await awaitActiveCleanupSweep();
		await releaseBackgroundState();
	}

	return {
		assetManifest,

		handleRequest(request, input) {
			// A stale routing hook calling into a disposed mount would otherwise
			// dispatch normally: an `/mcp` request would build a fresh cached
			// handler whose eviction sweep is permanently stopped, and any
			// Redis-backed path would reopen a client that the already-settled
			// disposal promise will never close again.
			if (mountState === 'disposed') {
				return Promise.resolve(
					jsonResponse(
						{ error: 'service_unavailable', error_description: 'This mount has been disposed.' },
						{ status: 503 },
					),
				);
			}

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
 * Closes the transport and Redis resources `mcp-handler.ts` established at
 * module evaluation. Shared by ordinary disposal and by the failed-startup
 * path, so a mount that never became usable releases exactly what a
 * disposed one does.
 */
async function releaseBackgroundState(): Promise<void> {
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

/**
 * Test seam: a process supports exactly one mount, ever, which a test file
 * exercising several would otherwise trip over on its second
 * `createApplicationMount()`. Never call this from application code.
 */
export const applicationMountTestHooks = {
	resetMountState(): void {
		mountState = 'none';
	},
};
