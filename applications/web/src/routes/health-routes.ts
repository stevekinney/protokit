import { sql } from 'drizzle-orm';
import { database } from '@template/database';
import { hasRegisteredUiExtensionResource } from '@template/mcp';
import { environment } from '@web/env';
import {
	checkBearerCredential,
	isPlaintextTransport,
} from '@web/lib/bearer-credential-authentication';
import { createCoalescedProbe } from '@web/lib/coalesced-probe-cache';
import { jsonResponse } from '@web/lib/http-response';
import { instanceIdentifier } from '@web/lib/instance-identifier';
import { mcpSupportedProtocolVersions } from '@web/lib/mcp-protocol-constants';
import { createRateLimitedResponse } from '@web/lib/rate-limit-response';
import { getTrustedProxyConfiguration } from '@web/lib/request-client-identifier';
import type { RequestContext } from '@web/lib/request-context';
import { enforceHealthProbeRateLimit } from '@web/lib/request-rate-limiter';
import { isRedisConfigured, isRedisHealthy } from '@web/lib/redis-client';
import { withDeadline } from '@web/lib/with-deadline';

/**
 * OPS-002 / S-15: `GET /health` — a public, unauthenticated liveness check.
 * Deliberately does nothing but confirm the process is up and can produce a
 * response: no database query, no Redis connection, no session lookup, no
 * instance identifier, no dependency topology. A container orchestrator (or
 * anyone else on the public internet) learns only that the server is alive.
 * Dependency health lives at the authenticated `GET /health/ready` below —
 * see this item's `.roadmap-progress/OPS-002.md` for why the split exists
 * rather than one endpoint doing both jobs.
 */
export function handleHealthGet(): Response {
	return jsonResponse({ status: 'ok' }, { status: 200 });
}

type DependencySnapshot = {
	status: 'ok' | 'degraded';
	dependencies: {
		redis: 'ok' | 'unavailable' | 'not_configured';
		database: 'ok' | 'unavailable';
	};
};

// The Neon HTTP driver's `execute` has no per-call timeout option, so a `select 1` that reaches a
// dependency which accepts the request but never answers (a wedged proxy, a hung connection pool)
// leaves this await open indefinitely -- the same class of gap `isRedisHealthy` has for `ping()`
// after `connect()` succeeds. Round-3 review (OPS-002): an unbounded probe here left the
// coalesced-probe cache's `inFlight` slot permanently occupied, since it only clears once the
// probe promise settles, so every subsequent `/health/ready` caller within the process lifetime
// would await the same probe that will never resolve or reject.
const databaseHealthProbeTimeoutMs = 2000;

// Round-14 review (P2): `withDeadline` bounds how long a CALLER waits, but it cannot cancel the
// `database.execute` promise it raced against -- there is no cancellation to ask for. Checked
// directly against the installed `@neondatabase/serverless`/`drizzle-orm` versions: the neon-http
// driver only accepts a `signal` via `fetchOptions` passed to `neon(...)` at CONNECTION
// construction (a fixed default merged into every query's fetch call), not per query, and
// `packages/database/src/index.ts` builds one shared, module-level `database` singleton reused by
// every caller in the process -- there is no per-call hook to attach a fresh `AbortSignal` to just
// this probe's fetch without either bypassing drizzle's `execute()` for this one call site or
// restructuring the shared client to thread a signal through every query in the codebase, which a
// readiness probe does not justify. So the promise `withDeadline` gave up on keeps running for
// real, and -- before this fix -- every later readiness poll during a prolonged outage launched
// its OWN fresh `database.execute()` on top of it, so abandoned probes (and the open fetches
// behind them) accumulated without bound for as long as the outage lasted.
//
// The honest fix given that constraint is the one `withDeadline`'s own doc comment already
// gestures at without providing: bound concurrency instead of pretending to cancel. At most one
// real `database.execute()` is ever outstanding; a readiness poll that arrives while one is
// already in flight races the SAME promise (with its own fresh deadline) rather than starting a
// second one, so the number of abandoned probes never exceeds one no matter how many polls arrive
// during the outage. The slot only clears once the real promise genuinely settles -- a truly
// permanent hang keeps reporting degraded from that one still-pending probe rather than
// manufacturing false recovery; real recovery is observed on the next poll that arrives after it
// finally settles.
let outstandingDatabaseProbe: Promise<boolean> | null = null;

async function isDatabaseHealthy(): Promise<boolean> {
	if (!outstandingDatabaseProbe) {
		outstandingDatabaseProbe = database
			.execute(sql`select 1`)
			.then(() => true)
			.catch(() => false)
			.finally(() => {
				outstandingDatabaseProbe = null;
			});
	}

	try {
		return await withDeadline(outstandingDatabaseProbe, databaseHealthProbeTimeoutMs);
	} catch {
		return false;
	}
}

/** Test-only: discards the tracked outstanding database probe between test cases. */
export function resetOutstandingDatabaseProbeForTests(): void {
	outstandingDatabaseProbe = null;
}

async function probeDependencies(): Promise<DependencySnapshot> {
	const redisConfigured = isRedisConfigured();
	const [redisHealthy, databaseHealthy] = await Promise.all([
		redisConfigured ? isRedisHealthy() : Promise.resolve(false),
		isDatabaseHealthy(),
	]);

	const degraded = (redisConfigured && !redisHealthy) || !databaseHealthy;

	let redisStatus: 'ok' | 'unavailable' | 'not_configured';
	if (!redisConfigured) {
		redisStatus = 'not_configured';
	} else {
		redisStatus = redisHealthy ? 'ok' : 'unavailable';
	}

	return {
		status: degraded ? 'degraded' : 'ok',
		dependencies: {
			redis: redisStatus,
			database: databaseHealthy ? 'ok' : 'unavailable',
		},
	};
}

// OPS-002: one coalesced/cached probe per process. A burst of authenticated
// readiness callers within the TTL window shares one real Postgres/Redis
// round trip instead of each triggering its own — see
// `coalesced-probe-cache.ts` for why this needs both coalescing and
// caching, not just one of the two. Held in a mutable binding (rather than
// a bare `const`) only so `resetHealthReadinessCacheForTests` can discard it
// between test cases — nothing in production code ever reassigns it.
let getCachedDependencySnapshot = createCoalescedProbe({
	ttlMs: (environment.HEALTH_READINESS_CACHE_TTL_SECONDS ?? 2) * 1000,
	probe: probeDependencies,
});

/**
 * Test-only: discards the cached readiness snapshot so each test observes a fresh probe. Also
 * discards the tracked outstanding database probe (see `isDatabaseHealthy` above) -- without
 * that, a test that leaves a hung mock probe outstanding would otherwise have it reused,
 * deadline and all, by the very next test that calls this to get a clean slate.
 */
export function resetHealthReadinessCacheForTests(): void {
	resetOutstandingDatabaseProbeForTests();
	getCachedDependencySnapshot = createCoalescedProbe({
		ttlMs: (environment.HEALTH_READINESS_CACHE_TTL_SECONDS ?? 2) * 1000,
		probe: probeDependencies,
	});
}

/**
 * OPS-002 / S-15: `GET /health/ready` — the authenticated, detailed
 * counterpart to `GET /health`. Reveals dependency status, the instance
 * identifier, supported protocol versions, and enabled extensions only to a
 * caller holding `HEALTH_READINESS_API_KEY`; an unauthenticated or
 * unconfigured deployment gets no response body worth reading (404/401,
 * matching `/metrics`'s fail-closed shape) rather than the topology this
 * item's finding (`S-15`) named as an information leak.
 */
export async function handleHealthReadinessGet(context: RequestContext): Promise<Response> {
	if (
		isPlaintextTransport({
			request: context.request,
			isProduction: environment.NODE_ENV === 'production',
			socketAddress: context.clientAddress,
			trustedProxyConfiguration: getTrustedProxyConfiguration(),
		})
	) {
		return jsonResponse(
			{ error: 'plaintext_transport_not_allowed', error_description: 'HTTPS is required' },
			{ status: 400, headers: { 'Cache-Control': 'no-store' } },
		);
	}

	const rateLimitResult = await enforceHealthProbeRateLimit({
		networkIdentity: context.networkIdentity,
	});
	if (!rateLimitResult.allowed) {
		return createRateLimitedResponse(rateLimitResult.retryAfterSeconds, {
			'Cache-Control': 'no-store',
		});
	}

	const credentialResult = checkBearerCredential({
		configuredKey: environment.HEALTH_READINESS_API_KEY,
		authorizationHeader: context.request.headers.get('authorization'),
	});

	if (credentialResult === 'not_configured') {
		return jsonResponse(
			{ error: 'not_found' },
			{ status: 404, headers: { 'Cache-Control': 'no-store' } },
		);
	}

	if (credentialResult === 'unauthorized') {
		return jsonResponse(
			{ error: 'unauthorized' },
			{ status: 401, headers: { 'Cache-Control': 'no-store' } },
		);
	}

	const snapshot = await getCachedDependencySnapshot();

	return jsonResponse(
		{
			status: snapshot.status,
			instanceIdentifier,
			protocolVersions: mcpSupportedProtocolVersions,
			extensions: {
				// Review round 4 / P2: this used to report the raw
				// `MCP_ENABLE_UI_EXTENSION` flag, which the setup wizard writes
				// `true` by default -- so an operator with the flag on but no
				// MCP App resource registered saw `extensions.ui: true` here
				// while `/mcp`'s real capabilities and OAuth metadata both
				// correctly suppressed it via `hasRegisteredUiExtensionResource()`
				// (see `packages/mcp/src/ui-extension-support.ts`). Readiness is
				// exactly the surface an operator uses to detect that kind of
				// misconfiguration, so it must report the same predicate the
				// server actually advertises on, not a raw configuration input.
				ui: environment.MCP_ENABLE_UI_EXTENSION && hasRegisteredUiExtensionResource(),
			},
			dependencies: snapshot.dependencies,
		},
		{
			status: snapshot.status === 'ok' ? 200 : 503,
			headers: { 'Cache-Control': 'no-store' },
		},
	);
}
