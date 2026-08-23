import { randomBytes } from 'node:crypto';
import { $ } from 'bun';

/**
 * DEPLOY-001 acceptance: the container this repository ships must actually
 * start, serve its health and discovery endpoints, and correctly challenge
 * an unauthenticated MCP request. This builds the real production image,
 * runs it against ephemeral Redis and Postgres instances on an isolated
 * Docker network, and exercises it over real HTTP — nothing here is mocked.
 *
 * The application's runtime database client speaks Neon's HTTP protocol
 * (`@neondatabase/serverless`), which a plain Postgres instance cannot
 * answer directly. `TEST-DB-001` solved this for the local integration lane
 * by vendoring a Neon-compatible HTTP proxy (`docker/local-neon-http-proxy`,
 * also used by `docker-compose.test.yml`) that sits in front of Postgres and
 * speaks the SQL-over-HTTP protocol the driver expects. This harness brings
 * that same proxy onto the isolated smoke-test network so the containerized
 * application reaches a real database over the exact code path production
 * uses, rather than accepting an "unavailable" database dependency as
 * expected.
 */

const runId = randomBytes(4).toString('hex');
const imageTag = `protokit-container-smoke:${runId}`;
const neonProxyImageTag = 'protokit-smoke-neon-proxy:latest';
const networkName = `protokit-smoke-net-${runId}`;
const postgresContainer = `protokit-smoke-postgres-${runId}`;
const neonProxyContainer = `protokit-smoke-neon-proxy-${runId}`;
const redisContainer = `protokit-smoke-redis-${runId}`;
const appContainer = `protokit-smoke-app-${runId}`;

const cleanupCommands: string[] = [];

function trackCleanup(command: string): void {
	cleanupCommands.push(command);
}

async function cleanup(): Promise<void> {
	for (const command of cleanupCommands.reverse()) {
		try {
			await $`sh -c ${command}`.quiet();
		} catch {
			// Best-effort cleanup; a failure here must never mask the real result.
		}
	}
}

/**
 * Waits for a readiness condition, polling at a fixed interval.
 *
 * This is a readiness probe, not a test timeout, and the distinction matters
 * for how generous the budget should be. The previous shape — five attempts
 * with exponential backoff from 250ms — gave up after about 3.75 seconds
 * total, which was enough on a developer laptop and not enough for a cold
 * container start on a continuous-integration runner, where the process has to
 * boot Bun, load the asset manifest, and open Postgres and Redis connections.
 * The job failed there having never actually tested anything.
 *
 * A longer budget does not weaken what this catches: a container that never
 * becomes ready still fails, just after a wait proportionate to a real cold
 * start. What DID weaken diagnosis was the error message — a crashed container
 * and a slow one produced identical output — so callers now supply an
 * `onTimeout` hook that dumps container logs before the failure is raised.
 */
async function waitForCondition(
	label: string,
	attempt: () => Promise<boolean>,
	options: { timeoutMs?: number; intervalMs?: number; onTimeout?: () => Promise<void> } = {},
): Promise<void> {
	const timeoutMs = options.timeoutMs ?? 60_000;
	const intervalMs = options.intervalMs ?? 500;
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (await attempt()) return;
		await Bun.sleep(intervalMs);
	}

	if (options.onTimeout) {
		await options.onTimeout().catch(() => {
			// Diagnostics are best-effort; never mask the real timeout.
		});
	}

	throw new Error(`Timed out waiting for: ${label} (after ${timeoutMs}ms)`);
}

function assert(condition: boolean, message: string): void {
	if (!condition) {
		throw new Error(`Container smoke test failed: ${message}`);
	}
}

async function containerHostPort(containerName: string, containerPort: number): Promise<number> {
	const mapping = (await $`docker port ${containerName} ${containerPort}`.text()).trim();
	const lastLine = mapping.split('\n').pop() ?? '';
	const port = lastLine.split(':').pop();
	if (!port || Number.isNaN(Number(port))) {
		throw new Error(`Could not determine host port for ${containerName}:${containerPort}`);
	}
	return Number(port);
}

/**
 * DEPLOY-001 also requires that two consecutive clean builds produce the
 * same declared asset file set, with no stale hashed file left over from a
 * previous build and no source map published. This runs the application's
 * asset build twice in a row from a clean state and compares the results.
 */
async function verifyReproducibleAssetBuild(): Promise<void> {
	console.log('[smoke] verifying two consecutive clean builds are reproducible');

	async function buildOnceAndListAssets(): Promise<{ manifest: unknown; filenames: string[] }> {
		await $`rm -rf applications/web/dist applications/web/public/assets`;
		await $`bun run build`.cwd('applications/web');
		const manifest = await Bun.file('applications/web/public/assets/manifest.json').json();
		const listing = await $`ls applications/web/public/assets`.text();
		const filenames = listing
			.split('\n')
			.filter((name) => name.length > 0)
			.sort();
		return { manifest, filenames };
	}

	const firstBuild = await buildOnceAndListAssets();
	const secondBuild = await buildOnceAndListAssets();

	assert(
		JSON.stringify(firstBuild.filenames) === JSON.stringify(secondBuild.filenames),
		`declared asset file set differs between consecutive builds: ${JSON.stringify(
			firstBuild.filenames,
		)} vs ${JSON.stringify(secondBuild.filenames)}`,
	);
	assert(
		JSON.stringify(firstBuild.manifest) === JSON.stringify(secondBuild.manifest),
		'asset manifest differs between consecutive builds',
	);
	for (const filename of secondBuild.filenames) {
		assert(!filename.endsWith('.map'), `source map published to public/assets: ${filename}`);
	}
}

/**
 * CONFIG-001 acceptance: "A production process exits before listening for
 * every missing or insecure required setting." This runs the exact image
 * this repository ships with `NODE_ENV=production` baked in (see the
 * Dockerfile) and no other configuration at all — matching the roadmap's own
 * `docker run --rm protokit-audit bun applications/web/dist/server.js`
 * verification line — and asserts the container exits nonzero instead of
 * accepting traffic.
 */
async function verifyProductionRefusesInsecureConfiguration(): Promise<void> {
	console.log('[smoke] verifying NODE_ENV=production with no configuration refuses to start');

	const refusalContainer = `protokit-smoke-refusal-${runId}`;
	try {
		let exitCode: number;
		try {
			await $`docker run --rm --name ${refusalContainer} ${imageTag}`.quiet();
			exitCode = 0;
		} catch (error) {
			exitCode = (error as { exitCode?: number }).exitCode ?? 1;
		}
		assert(
			exitCode !== 0,
			`expected the production image to refuse to start with no configuration, but it exited 0`,
		);
	} finally {
		await $`docker rm -f ${refusalContainer}`.quiet().catch(() => {});
	}
}

async function main(): Promise<void> {
	await verifyReproducibleAssetBuild();

	console.log(`[smoke] building production image (${imageTag})`);
	await $`docker build --no-cache -t ${imageTag} .`;
	trackCleanup(`docker rmi -f ${imageTag}`);

	await verifyProductionRefusesInsecureConfiguration();

	console.log('[smoke] creating isolated network');
	await $`docker network create ${networkName}`;
	trackCleanup(`docker network rm ${networkName}`);

	console.log('[smoke] starting ephemeral Redis');
	await $`docker run -d --name ${redisContainer} --network ${networkName} --network-alias redis redis:8-alpine`;
	trackCleanup(`docker rm -f ${redisContainer}`);

	console.log('[smoke] starting ephemeral Postgres');
	await $`docker run -d --name ${postgresContainer} --network ${networkName} --network-alias postgres -p 0:5432 -e POSTGRES_USER=smoke -e POSTGRES_PASSWORD=smoke -e POSTGRES_DB=smoke postgres:17`;
	trackCleanup(`docker rm -f ${postgresContainer}`);

	await waitForCondition('Postgres accepting connections', async () => {
		try {
			await $`docker exec ${postgresContainer} pg_isready -U smoke`.quiet();
			return true;
		} catch {
			return false;
		}
	});

	const postgresHostPort = await containerHostPort(postgresContainer, 5432);
	const hostDatabaseUrl = `postgresql://smoke:smoke@localhost:${postgresHostPort}/smoke`;

	console.log('[smoke] applying migrations against the empty database');
	// `drizzle-kit migrate` speaks raw Postgres wire protocol regardless of the
	// runtime driver, so this step talks directly to Postgres — no proxy
	// involved. The proxy only matters for the application's own runtime
	// queries, exercised below.
	await $`bun turbo db:migrate --filter=@template/database --force`.env({
		...process.env,
		DATABASE_URL: hostDatabaseUrl,
	});

	console.log('[smoke] building the local Neon HTTP proxy image (vendored, TEST-DB-001)');
	// Not tagged per-run and not torn down in cleanup: it is identical,
	// vendored, unmodified source every time (see docker/local-neon-http-proxy),
	// and it's a from-source Rust build, so reusing Docker's layer cache across
	// smoke test runs (the same tradeoff `docker-compose.test.yml` makes) keeps
	// repeat runs fast instead of rebuilding the proxy binary from scratch
	// every time.
	await $`docker build -t ${neonProxyImageTag} ./docker/local-neon-http-proxy`;

	console.log('[smoke] starting the Neon HTTP proxy');
	await $`docker run -d --name ${neonProxyContainer} --network ${networkName} --network-alias neon-proxy -e PG_CONNECTION_STRING=postgres://smoke:smoke@postgres:5432/smoke ${neonProxyImageTag}`;
	trackCleanup(`docker rm -f ${neonProxyContainer}`);

	await waitForCondition(
		'Neon HTTP proxy accepting connections',
		async () => {
			try {
				await $`docker exec ${neonProxyContainer} curl -s -o /dev/null http://localhost:4444/sql`.quiet();
				return true;
			} catch {
				return false;
			}
		},
		8,
	);

	console.log('[smoke] starting the application container');
	const sessionSigningSecret = randomBytes(32).toString('hex');
	// OPS-002: `GET /health` is now a dependency-free liveness check — see
	// `applications/web/src/routes/health-routes.ts`. Dependency status
	// (asserted below) moved to the authenticated `GET /health/ready`, so
	// this run needs a readiness credential to reach it, the same as any
	// real deployment's operator would.
	const healthReadinessApiKey = randomBytes(32).toString('hex');
	// CONFIG-001: `NODE_ENV=production` now refuses to start without an
	// encrypted, certificate-verified `REDIS_URL`/`DATABASE_URL` (no local
	// host, no placeholder credentials) — see `startup-invariants.ts`. This
	// harness's job is exercising the *artifact* (real HTTP behavior, real
	// health/discovery endpoints), not standing up TLS-terminated ephemeral
	// Redis/Postgres containers, so the functional run below boots as
	// `NODE_ENV=test` (every other setting matches what production would
	// receive). `verifyProductionRefusesInsecureConfiguration` below is what
	// actually proves the production fail-closed path against this exact
	// image, matching CONFIG-001's own named verification command.
	const appRunArguments = [
		'run',
		'-d',
		'--name',
		appContainer,
		'--network',
		networkName,
		'-p',
		'0:3000',
		'-e',
		'NODE_ENV=test',
		// DEPLOY-001: outside production the server binds to loopback by default,
		// which inside a container makes the published port unreachable. Widening
		// the binding is deliberate and explicit — see `lib/resolve-bind-address.ts`.
		'-e',
		'SERVER_BIND_ADDRESS=0.0.0.0',
		'-e',
		'PORT=3000',
		'-e',
		'BASE_URL=http://localhost:3000',
		'-e',
		`SESSION_SIGNING_SECRET=${sessionSigningSecret}`,
		'-e',
		'REDIS_URL=redis://redis:6379',
		'-e',
		'DATABASE_URL=postgresql://smoke:smoke@postgres:5432/smoke',
		// TEST-DB-001: routes the Neon serverless driver's SQL-over-HTTP
		// requests at the vendored local proxy instead of real Neon, the same
		// override the integration test lane uses. This is what makes the
		// database dependency below actually reachable rather than
		// structurally unable to answer the driver's protocol.
		'-e',
		'DATABASE_LOCAL_PROXY_URL=http://neon-proxy:4444/sql',
		'-e',
		`HEALTH_READINESS_API_KEY=${healthReadinessApiKey}`,
		imageTag,
	];
	await $`docker ${appRunArguments}`;
	trackCleanup(`docker rm -f ${appContainer}`);

	const appHostPort = await containerHostPort(appContainer, 3000);
	const appBaseUrl = `http://localhost:${appHostPort}`;

	await waitForCondition(
		`application listening on ${appBaseUrl}`,
		async () => {
			try {
				await fetch(`${appBaseUrl}/health`);
				return true;
			} catch {
				return false;
			}
		},
		{
			// A cold container start on a continuous-integration runner is slower
			// than on a laptop; the previous ~3.75s budget expired before the server
			// finished booting. Dump the container's logs on timeout so a genuine
			// startup crash is distinguishable from a slow start, which the old
			// message could not do.
			onTimeout: async () => {
				console.error(
					'[smoke] application container did not become ready — container logs follow:',
				);
				const logs = await $`docker logs ${appContainer}`.nothrow().quiet();
				process.stderr.write(logs.stdout.toString());
				process.stderr.write(logs.stderr.toString());
			},
		},
	);

	console.log('[smoke] checking /health (public liveness, no dependency detail)');
	const healthResponse = await fetch(`${appBaseUrl}/health`);
	assert(
		healthResponse.status === 200,
		`expected /health to report liveness, got status ${healthResponse.status}`,
	);
	const health = (await healthResponse.json()) as Record<string, unknown>;
	assert(
		Object.keys(health).length === 1 && health.status === 'ok',
		`expected /health to reveal nothing but { status: "ok" }, got ${JSON.stringify(health)}`,
	);

	console.log('[smoke] checking /health/ready (authenticated readiness, dependency detail)');
	const unauthenticatedReadinessResponse = await fetch(`${appBaseUrl}/health/ready`);
	assert(
		unauthenticatedReadinessResponse.status === 401,
		`expected /health/ready with no credential to be rejected, got status ${unauthenticatedReadinessResponse.status}`,
	);

	const readinessResponse = await fetch(`${appBaseUrl}/health/ready`, {
		headers: { Authorization: `Bearer ${healthReadinessApiKey}` },
	});
	assert(
		readinessResponse.status === 200,
		`expected /health/ready to report every dependency healthy, got status ${readinessResponse.status}`,
	);
	const readiness = (await readinessResponse.json()) as {
		dependencies: { redis: string; database: string };
	};
	assert(
		readiness.dependencies.redis === 'ok',
		`expected Redis dependency healthy, got ${readiness.dependencies.redis}`,
	);
	assert(
		readiness.dependencies.database === 'ok',
		`expected database dependency healthy through the Neon HTTP proxy, got ${readiness.dependencies.database}`,
	);

	console.log('[smoke] checking OAuth discovery endpoints');
	const protectedResourceResponse = await fetch(
		`${appBaseUrl}/.well-known/oauth-protected-resource/mcp`,
	);
	assert(
		protectedResourceResponse.status === 200,
		`expected 200 from protected resource metadata, got ${protectedResourceResponse.status}`,
	);

	const authorizationServerResponse = await fetch(
		`${appBaseUrl}/.well-known/oauth-authorization-server`,
	);
	assert(
		authorizationServerResponse.status === 200,
		`expected 200 from authorization server metadata, got ${authorizationServerResponse.status}`,
	);

	console.log('[smoke] checking unauthenticated MCP request receives the correct challenge');
	const mcpResponse = await fetch(`${appBaseUrl}/mcp`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}',
	});
	assert(
		mcpResponse.status === 401,
		`expected 401 for unauthenticated MCP request, got ${mcpResponse.status}`,
	);
	const challenge = mcpResponse.headers.get('www-authenticate');
	assert(Boolean(challenge?.startsWith('Bearer')), `expected a Bearer challenge, got ${challenge}`);
	assert(
		Boolean(challenge?.includes('resource_metadata=')),
		`expected the challenge to advertise resource_metadata, got ${challenge}`,
	);

	console.log('[smoke] all checks passed');
}

try {
	await main();
} catch (error) {
	console.error(error);
	await cleanup();
	process.exit(1);
}

await cleanup();
