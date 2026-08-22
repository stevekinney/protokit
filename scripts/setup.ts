import { randomBytes } from 'node:crypto';

import {
	commandExists,
	execute,
	appendToEnvironmentFile,
	getEnvironmentValue,
	readEnvironmentFile,
	prompt,
	promptSecret,
	confirm,
	setGithubSecret,
} from './utilities.ts';

function checkPrerequisites(commands: string[]) {
	const missing = commands.filter((command) => !commandExists(command));

	if (missing.length > 0) {
		console.error(`Missing required CLIs: ${missing.join(', ')}`);
		console.error('Install them before running setup:');
		if (missing.includes('neonctl')) console.error('  neonctl: npm install -g neonctl');
		if (missing.includes('railway')) console.error('  railway: npm install -g @railway/cli');
		if (missing.includes('gh')) console.error('  gh: https://cli.github.com/');
		process.exit(1);
	}
}

/**
 * Neon's documented region identifiers (e.g. `aws-us-east-2`, `azure-eastus2`) are lowercase
 * alphanumerics joined by single hyphens. This is a sanity check on the shape of the value, not
 * a security boundary — `execute()` already passes the region as a literal argv element, so a
 * malformed value cannot execute anything even if this check were skipped. Rejecting it early
 * just gives a clearer error than a confusing `neonctl` failure three steps later.
 */
export function isValidNeonRegionIdentifier(region: string): boolean {
	return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(region);
}

async function setupNeon(): Promise<
	{ projectId: string; connectionString: string; directConnectionString: string } | undefined
> {
	console.log('\n--- Neon ---\n');

	if (!commandExists('neonctl')) {
		console.error('neonctl is not installed. Install it with: npm install -g neonctl');
		process.exit(1);
	}

	const existingDatabaseUrl = getEnvironmentValue('DATABASE_URL');

	if (existingDatabaseUrl) {
		console.log('DATABASE_URL already exists in .env.local.');
		const createNew = await confirm('Create a new Neon project anyway? (y/N): ');
		if (!createNew) {
			console.log('Keeping existing configuration.');
			return undefined;
		}
	}

	const region = (await prompt('Neon region (default: aws-us-east-2): ')) || 'aws-us-east-2';

	if (!isValidNeonRegionIdentifier(region)) {
		console.error(
			`"${region}" does not look like a Neon region identifier (expected something like "aws-us-east-2").`,
		);
		process.exit(1);
	}

	let organizationId: string | undefined;
	try {
		const organizationsOutput = execute('neonctl', ['orgs', 'list', '--output', 'json']);
		const organizations: Array<{ id: string; name: string }> = JSON.parse(organizationsOutput);
		if (organizations.length > 1) {
			console.log('\nAvailable organizations:');
			for (let i = 0; i < organizations.length; i++) {
				console.log(`  ${i + 1}. ${organizations[i].name} (${organizations[i].id})`);
			}
			const selection = await prompt(
				`Select organization (1-${organizations.length}, blank for personal): `,
			);
			const index = parseInt(selection, 10) - 1;
			if (index >= 0 && index < organizations.length) {
				organizationId = organizations[index].id;
			}
		}
	} catch {
		// Non-fatal: old neonctl version or no orgs — continue without --org-id
	}

	const createProjectArguments = ['projects', 'create', '--region-id', region, '--output', 'json'];
	if (organizationId) createProjectArguments.push('--org-id', organizationId);

	let neonProjectId: string;
	try {
		const output = execute('neonctl', createProjectArguments);
		const project = JSON.parse(output);
		neonProjectId = project.project.id;
		console.log(`Created Neon project: ${neonProjectId}`);
	} catch {
		console.error('Failed to create Neon project. Make sure you are logged in: neonctl auth');
		process.exit(1);
		return; // unreachable, satisfies TypeScript control flow
	}

	const connectionString = execute('neonctl', [
		'connection-string',
		'--project-id',
		neonProjectId,
		'--pooled',
	]);
	const directConnectionString = execute('neonctl', [
		'connection-string',
		'--project-id',
		neonProjectId,
	]);

	appendToEnvironmentFile('DATABASE_URL', connectionString);
	appendToEnvironmentFile('DATABASE_URL_UNPOOLED', directConnectionString);
	console.log('Database URLs written to .env.local');

	console.log('\nNeon project created successfully.');
	console.log(`  Project dashboard: https://console.neon.tech/app/projects/${neonProjectId}`);
	console.log('Next, configure your own Google OAuth credentials for sign-in.');

	return { projectId: neonProjectId, connectionString, directConnectionString };
}

async function setupGoogle() {
	console.log('\n--- Google OAuth ---\n');

	console.log('Google OAuth credentials are required for authentication.');
	console.log('Configure your own credentials for both development and production.\n');

	console.log('Open Google Cloud Console: https://console.cloud.google.com/apis/credentials');
	console.log('Create OAuth 2.0 Client ID with redirect URI:');
	console.log('  https://your-app.railway.app/api/auth/callback/google\n');

	const googleClientId = await prompt('GOOGLE_CLIENT_ID (blank to skip): ');
	const googleClientSecret = googleClientId
		? await promptSecret('GOOGLE_CLIENT_SECRET (input hidden): ')
		: '';

	if (googleClientId && googleClientSecret) {
		appendToEnvironmentFile('GOOGLE_CLIENT_ID', googleClientId);
		appendToEnvironmentFile('GOOGLE_CLIENT_SECRET', googleClientSecret);
		console.log('Google OAuth credentials written to .env.local');
	} else {
		console.log('Skipping — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local later.');
	}
}

async function setupEnvironmentMode() {
	console.log('\n--- Environment Mode ---\n');

	// CONFIG-001: NODE_ENV has no schema default anymore — every environment
	// must set it explicitly, including a local `.env.local` for `bun turbo dev`.
	if (!getEnvironmentValue('NODE_ENV')) {
		appendToEnvironmentFile('NODE_ENV', 'development');
		console.log('Wrote NODE_ENV=development to .env.local.');
	} else {
		console.log('NODE_ENV already exists in .env.local.');
	}
}

async function setupSessionConfiguration() {
	console.log('\n--- Session Configuration ---\n');

	const existingSecret = getEnvironmentValue('SESSION_SIGNING_SECRET');

	if (existingSecret) {
		console.log('SESSION_SIGNING_SECRET already exists in .env.local.');
	} else {
		const secret = randomBytes(32).toString('hex');
		appendToEnvironmentFile('SESSION_SIGNING_SECRET', secret);
		console.log('Generated SESSION_SIGNING_SECRET and written to .env.local (value not printed)');
	}

	if (!getEnvironmentValue('SESSION_COOKIE_NAME')) {
		appendToEnvironmentFile('SESSION_COOKIE_NAME', 'application_session');
	}

	if (!getEnvironmentValue('SESSION_TIME_TO_LIVE_SECONDS')) {
		appendToEnvironmentFile('SESSION_TIME_TO_LIVE_SECONDS', '2592000');
	}
}

async function setupRedis() {
	console.log('\n--- Redis ---\n');

	const existingRedisUrl = getEnvironmentValue('REDIS_URL');
	if (existingRedisUrl) {
		console.log('REDIS_URL already exists in .env.local.');
		return;
	}

	// May carry embedded credentials (redis://user:pass@host) — hidden the same as any other
	// secret input.
	const redisUrl = await promptSecret(
		'REDIS_URL (default: redis://localhost:6379, input hidden): ',
	);
	appendToEnvironmentFile('REDIS_URL', redisUrl || 'redis://localhost:6379');
	appendToEnvironmentFile('RATE_LIMIT_REGISTER_MAX', '10');
	appendToEnvironmentFile('RATE_LIMIT_REGISTER_WINDOW_SECONDS', '60');
	appendToEnvironmentFile('RATE_LIMIT_TOKEN_MAX', '30');
	appendToEnvironmentFile('RATE_LIMIT_TOKEN_WINDOW_SECONDS', '60');

	console.log('Redis URL and rate-limit defaults written to .env.local');
}

async function setupMcpProtocolAndExtensions() {
	console.log('\n--- MCP Protocol + Extensions ---\n');
	console.log('Protocol version negotiation (2025-11-25 and 2026-07-28) is handled by the SDK.');

	const existingAllowedOrigins = getEnvironmentValue('MCP_ALLOWED_ORIGINS');
	if (!existingAllowedOrigins) {
		const suggestedOrigin = 'http://localhost:3000';
		const allowedOriginsInput = await prompt(
			`MCP_ALLOWED_ORIGINS (comma-separated, default: ${suggestedOrigin}): `,
		);
		appendToEnvironmentFile('MCP_ALLOWED_ORIGINS', allowedOriginsInput || suggestedOrigin);
	}

	if (!getEnvironmentValue('MCP_ENABLE_UI_EXTENSION')) {
		appendToEnvironmentFile('MCP_ENABLE_UI_EXTENSION', 'true');
	}
	if (!getEnvironmentValue('MCP_CONFORMANCE_MODE')) {
		appendToEnvironmentFile('MCP_CONFORMANCE_MODE', 'false');
	}
}

/**
 * Mirrors `assertProductionStartupInvariants`'s canonical-origin check
 * (`applications/web/src/lib/production-startup-requirements.ts`): scheme + host (+ optional
 * port) only, HTTPS, no path/query/fragment/userinfo. `setupBaseUrl` uses this to keep re-prompting
 * instead of writing a value production will reject at startup.
 */
export function isValidProductionBaseUrl(value: string): boolean {
	if (!value.startsWith('https://')) return false;
	try {
		const parsed = new URL(value);
		return (
			parsed.origin === value &&
			parsed.pathname === '/' &&
			!parsed.search &&
			!parsed.hash &&
			!parsed.username &&
			!parsed.password
		);
	} catch {
		return false;
	}
}

/**
 * `OAUTH-P1` (round 3 review): a fresh full setup ran `setupRailway` straight into
 * `planRailwayVariables`, which unconditionally forces `NODE_ENV=production` on whatever gets
 * pushed to Railway — but no phase ever collected `BASE_URL`. `assertProductionStartupInvariants`
 * then refuses to start the deployed service, because production requires one canonical HTTPS
 * `BASE_URL` (OAuth issuer identity + MCP resource metadata), so the wizard produced a
 * configuration that could not boot unless the operator separately knew to add an undocumented
 * value. This phase collects it before Railway is touched, so it is available to copy across in
 * `setupRailway` below.
 *
 * Railway does not assign a domain until the first deploy, so this cannot be discovered
 * automatically — the operator must supply the URL they intend to serve from (a Railway-generated
 * `*.up.railway.app` domain reserved via `railway domain`, or a custom domain already pointed at
 * the service). Required, not optional: skipping it here only defers the identical failure to a
 * point after Railway has already been configured.
 */
async function setupBaseUrl() {
	console.log('\n--- Production Base URL ---\n');

	if (getEnvironmentValue('BASE_URL')) {
		console.log('BASE_URL already exists in .env.local.');
		return;
	}

	console.log('Production requires one canonical, HTTPS BASE_URL (OAuth issuer identity and MCP');
	console.log('resource metadata are both derived from it). Reserve a Railway domain first with');
	console.log('`railway domain`, or use a custom domain already pointed at this service.\n');

	for (;;) {
		const input = await prompt('BASE_URL (e.g. https://your-app.up.railway.app): ');
		if (!input) {
			console.warn(
				'BASE_URL is required before Railway can be configured for production. Try again.',
			);
			continue;
		}
		if (!isValidProductionBaseUrl(input)) {
			console.warn(
				'BASE_URL must be a canonical https:// origin only (no path, query, fragment, or ' +
					'embedded credentials). Try again.',
			);
			continue;
		}
		appendToEnvironmentFile('BASE_URL', input);
		console.log('BASE_URL written to .env.local');
		return;
	}
}

/**
 * Environment keys that only ever describe *this* machine and must never be copied to Railway
 * verbatim, because Railway is a production deployment target by definition. Copying
 * `NODE_ENV=development` from a developer's `.env.local` overrides the image's baked-in
 * `ENV NODE_ENV=production` (`Dockerfile`'s runtime stage), which makes `CONFIG-001`'s fail-closed
 * production invariants vacuous and `server.ts` bind to loopback (`OPEN-1`) — the deployed service
 * becomes unreachable through Railway's published port. `DATABASE_LOCAL_PROXY_URL` and
 * `PROTOKIT_TUNNEL_ACTIVE` are the same class of local-only value: the former is explicitly
 * required to be unset in production (`production-startup-requirements.ts`), and the latter only
 * has meaning for a locally spawned `develop.ts --tunnel` process.
 */
export const RAILWAY_EXCLUDED_ENVIRONMENT_KEYS: ReadonlySet<string> = new Set([
	'NODE_ENV',
	'DATABASE_LOCAL_PROXY_URL',
	'PROTOKIT_TUNNEL_ACTIVE',
]);

/**
 * Pure planning function for what `setupRailway` pushes: every non-empty `.env.local` entry
 * except the local-only keys above, plus an explicit `NODE_ENV=production` — never inferred from
 * whatever the developer's own `.env.local` happens to say, since a Railway service is production
 * by definition regardless of what mode the machine running `setup.ts` is in.
 */
export function planRailwayVariables(
	variables: Record<string, string | undefined>,
): Array<[string, string]> {
	const plan: Array<[string, string]> = [];
	for (const [key, value] of Object.entries(variables)) {
		if (!value) continue;
		if (RAILWAY_EXCLUDED_ENVIRONMENT_KEYS.has(key)) continue;
		plan.push([key, value]);
	}
	plan.push(['NODE_ENV', 'production']);
	return plan;
}

async function setupRailway() {
	console.log('\n--- Railway ---\n');

	if (!commandExists('railway')) {
		console.warn(
			'railway CLI is not installed. Skipping. Install it with: npm install -g @railway/cli',
		);
		return;
	}

	const shouldConfigure = await confirm('Configure Railway deployment? (y/N): ');
	if (!shouldConfigure) return;

	// `OAUTH-P1`: refuse to push a configuration that `assertProductionStartupInvariants` will
	// reject at startup. `planRailwayVariables` always forces `NODE_ENV=production`, and
	// production requires BASE_URL — failing the phase here (before `railway init` even runs) is
	// cheaper than an operator discovering it only once the deployed service won't boot.
	if (!getEnvironmentValue('BASE_URL')) {
		console.error(
			'BASE_URL is not set in .env.local. Production requires one canonical HTTPS BASE_URL ' +
				'(assertProductionStartupInvariants rejects a deployment without it). Run ' +
				'`bun scripts/setup.ts base-url` first, then re-run this phase.',
		);
		process.exitCode = 1;
		return;
	}

	console.log('\nInitializing Railway project...');
	try {
		execute('railway', ['init', '-y'], { stdio: 'inherit' });

		const variables = readEnvironmentFile();
		for (const [key, value] of planRailwayVariables(variables)) {
			try {
				// `--stdin` delivers the value over stdin rather than as an argv element, so a
				// credential never appears in `ps` output while Railway is configuring it.
				execute('railway', ['variable', 'set', key, '--stdin'], { input: value });
			} catch {
				console.warn(`  Failed to set ${key} on Railway`);
			}
		}
		console.log('Railway environment variables configured (NODE_ENV forced to production).');
	} catch {
		console.warn('Railway setup failed. Configure manually with: railway init');
	}
}

async function setupGithubSecrets(neonProjectId?: string) {
	console.log('\n--- GitHub Secrets ---\n');

	if (!commandExists('gh')) {
		console.warn('gh CLI is not installed. Skipping. Install it from: https://cli.github.com/');
		return;
	}

	const shouldConfigure = await confirm('Set GitHub secrets for CI/CD? (y/N): ');
	if (!shouldConfigure) return;

	const connectionString = neonProjectId
		? execute('neonctl', ['connection-string', '--project-id', neonProjectId, '--pooled'])
		: getEnvironmentValue('DATABASE_URL');

	const directConnectionString = neonProjectId
		? execute('neonctl', ['connection-string', '--project-id', neonProjectId])
		: getEnvironmentValue('DATABASE_URL_UNPOOLED');

	if (!connectionString || !directConnectionString) {
		console.error('DATABASE_URL and DATABASE_URL_UNPOOLED are required.');
		console.error('Run the Neon setup phase first, or add them to .env.local manually.');
		return;
	}

	const projectId = neonProjectId || (await prompt('NEON_PROJECT_ID: '));

	if (!projectId) {
		console.error('Neon project ID is required for GitHub secrets.');
		return;
	}

	try {
		setGithubSecret('NEON_PROJECT_ID', projectId);
		setGithubSecret('DATABASE_URL', connectionString);
		setGithubSecret('DATABASE_URL_UNPOOLED', directConnectionString);

		const neonApiKey = await promptSecret(
			'NEON_API_KEY (for PR workflow Neon branch creation, blank to skip, input hidden): ',
		);

		if (neonApiKey) {
			setGithubSecret('NEON_API_KEY', neonApiKey);
		} else {
			console.warn(
				'Skipping NEON_API_KEY — PR database validation workflow will not work without it.',
			);
		}

		console.log('GitHub secrets configured.');
	} catch {
		console.warn('Failed to set GitHub secrets. Make sure gh is authenticated.');
	}
}

async function runInitialMigration() {
	console.log('\n--- Migration ---\n');
	console.log('Running initial migration...');
	try {
		execute('bun', ['scripts/migrate.ts'], { stdio: 'inherit' });
		console.log('Migration completed successfully.');
	} catch {
		console.warn('Migration failed. Run manually: bun scripts/migrate.ts');
	}

	console.log('Verifying database connectivity...');
	try {
		execute('bun', [
			'-e',
			"const { neon } = require('@neondatabase/serverless'); const sql = neon(process.env.DATABASE_URL); sql`SELECT 1`.then(() => console.log('Connected.'))",
		]);
	} catch {
		console.warn('Could not verify database connectivity. Check DATABASE_URL.');
	}
}

async function runFullSetup() {
	console.log('\n=== Bun + React MCP Template Setup ===\n');

	console.log('Checking prerequisites...');
	checkPrerequisites(['neonctl']);
	console.log('All prerequisites found.');

	await setupEnvironmentMode();
	const neonResult = await setupNeon();
	await setupSessionConfiguration();
	await setupGoogle();
	await setupRedis();
	await setupMcpProtocolAndExtensions();
	await setupBaseUrl();
	await setupRailway();
	await setupGithubSecrets(neonResult?.projectId);
	await runInitialMigration();

	console.log('\n=== Setup Complete ===');
	console.log('');
	console.log('Next steps:');
	console.log('  1. bun turbo dev             — Start development server');
	console.log('  2. bun scripts/develop.ts --tunnel');
	console.log('                               — Start dev server + a public tunnel for claude.ai');
	console.log('  3. bunx @modelcontextprotocol/inspector@2.3.0');
	console.log('                               — Debug MCP locally');
	console.log('');
}

const subcommand = process.argv[2];

const phases: Record<string, () => Promise<void>> = {
	environment: async () => {
		await setupEnvironmentMode();
	},
	neon: async () => {
		await setupNeon();
	},
	google: async () => {
		await setupGoogle();
	},
	session: async () => {
		await setupSessionConfiguration();
	},
	redis: async () => {
		await setupRedis();
	},
	mcp: async () => {
		await setupMcpProtocolAndExtensions();
	},
	'base-url': async () => {
		await setupBaseUrl();
	},
	railway: async () => {
		await setupRailway();
	},
	github: async () => {
		await setupGithubSecrets();
	},
	migration: async () => {
		await runInitialMigration();
	},
};

if (import.meta.main) {
	if (subcommand) {
		const phase = phases[subcommand];
		if (!phase) {
			console.error(`Unknown phase: ${subcommand}`);
			console.error(`Available phases: ${Object.keys(phases).join(', ')}`);
			process.exit(1);
		}
		await phase();
	} else {
		await runFullSetup();
	}
}
