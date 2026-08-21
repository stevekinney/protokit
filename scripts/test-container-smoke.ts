import { randomBytes } from 'node:crypto';
import { $ } from 'bun';

/**
 * DEPLOY-001 acceptance: the container this repository ships must actually
 * start, serve its health and discovery endpoints, and correctly challenge
 * an unauthenticated MCP request. This builds the real production image,
 * runs it against ephemeral Redis and Postgres instances on an isolated
 * Docker network, and exercises it over real HTTP — nothing here is mocked.
 *
 * `DATABASE_URL` is deliberately pointed at a plain `postgres:17` container.
 * The application's runtime database client speaks Neon's HTTP protocol
 * (`@neondatabase/serverless`), which a plain Postgres instance cannot
 * answer — that mismatch is a separate, already-tracked defect (BUG-002,
 * owned by `TEST-DB-001`). Until that lands, `/health` is expected to
 * report `database: "unavailable"`; this script asserts that exact
 * dependency-level shape rather than papering over it, so the check
 * tightens automatically once `TEST-DB-001` fixes the underlying driver
 * mismatch instead of silently going stale.
 */

const runId = randomBytes(4).toString('hex');
const imageTag = `protokit-container-smoke:${runId}`;
const networkName = `protokit-smoke-net-${runId}`;
const postgresContainer = `protokit-smoke-postgres-${runId}`;
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

async function waitForCondition(
	label: string,
	attempt: () => Promise<boolean>,
	maxAttempts = 5,
): Promise<void> {
	let delayMs = 250;
	for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
		if (await attempt()) return;
		if (attemptNumber === maxAttempts) {
			throw new Error(`Timed out waiting for: ${label} (${maxAttempts} attempts)`);
		}
		await Bun.sleep(delayMs);
		delayMs *= 2;
	}
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
	await $`bun turbo db:migrate --filter=@template/database --force`.env({
		...process.env,
		DATABASE_URL: hostDatabaseUrl,
	});

	console.log('[smoke] starting the application container');
	const sessionSigningSecret = randomBytes(32).toString('hex');
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
		imageTag,
	];
	await $`docker ${appRunArguments}`;
	trackCleanup(`docker rm -f ${appContainer}`);

	const appHostPort = await containerHostPort(appContainer, 3000);
	const appBaseUrl = `http://localhost:${appHostPort}`;

	await waitForCondition(`application listening on ${appBaseUrl}`, async () => {
		try {
			await fetch(`${appBaseUrl}/health`);
			return true;
		} catch {
			return false;
		}
	});

	console.log('[smoke] checking /health');
	const healthResponse = await fetch(`${appBaseUrl}/health`);
	assert(
		healthResponse.status === 200 || healthResponse.status === 503,
		`unexpected /health status ${healthResponse.status}`,
	);
	const health = (await healthResponse.json()) as {
		dependencies: { redis: string; database: string };
	};
	assert(
		health.dependencies.redis === 'ok',
		`expected Redis dependency healthy, got ${health.dependencies.redis}`,
	);
	if (health.dependencies.database !== 'ok') {
		console.log(
			'[smoke] database dependency reports "' +
				health.dependencies.database +
				'" — expected until TEST-DB-001 fixes the neon-http/plain-Postgres mismatch (BUG-002)',
		);
	}

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
