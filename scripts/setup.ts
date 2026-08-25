import { randomBytes } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

import { collectProductionStartupFailures } from '@template/web/lib/production-startup-requirements';

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

	// `/auth/google/callback` (not `/api/auth/callback/google`) is what the router and both
	// token-exchange call sites actually serve — `applications/web/src/application.ts`'s route
	// table and `applications/web/src/lib/google-authentication.ts`'s `callbackUrl` at both the
	// authorization-request and code-exchange steps. Google requires an exact registered redirect
	// URI match, so printing any other path here hands the operator credentials that fail sign-in
	// with a redirect-URI mismatch. Both a production and a localhost URI are printed because
	// Google Cloud Console requires every environment's exact URI to be registered up front.
	console.log('Open Google Cloud Console: https://console.cloud.google.com/apis/credentials');
	console.log('Create OAuth 2.0 Client ID with these redirect URIs (register both):');
	console.log('  https://your-app.up.railway.app/auth/google/callback');
	console.log('  http://localhost:3000/auth/google/callback\n');

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
	// secret input. The `redis://localhost:6379` default is for local development only:
	// `setupRailway` below never copies this value to Railway — it requires a separate,
	// validated `rediss://` endpoint before pushing anything, because production startup
	// (`assertProductionStartupInvariants`) rejects both a loopback host and the non-TLS
	// `redis://` scheme outright.
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
/**
 * A review finding (P2): the phase below used to skip re-prompting on mere
 * presence of a `BASE_URL` value, so a leftover local-dev value
 * (`http://localhost:3000`) or a URL with a path/query already sitting in
 * `.env.local` survived untouched into `setupRailway`, which also only
 * checks presence -- production would then refuse to start
 * (`collectProductionStartupFailures` rejects it) after the deploy
 * credential was already pushed. Split into a pure predicate, held to the
 * exact same rule newly entered values are, so it can be unit tested
 * without stdin: an existing value must both be present AND pass
 * `isValidProductionBaseUrl` for the phase to skip.
 */
export function shouldPromptForBaseUrl(existingValue: string | undefined): boolean {
	return existingValue === undefined || !isValidProductionBaseUrl(existingValue);
}

async function setupBaseUrl() {
	console.log('\n--- Production Base URL ---\n');

	const existingBaseUrl = getEnvironmentValue('BASE_URL');
	if (existingBaseUrl && !shouldPromptForBaseUrl(existingBaseUrl)) {
		console.log('BASE_URL already exists in .env.local.');
		return;
	}

	if (existingBaseUrl) {
		console.warn(
			`BASE_URL already exists in .env.local but is not a valid production origin: "${existingBaseUrl}". ` +
				'It must be a canonical https:// origin only (no path, query, fragment, or embedded ' +
				'credentials). Replacing it.',
		);
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
 * Mirrors `redisUrlFailures`'s three production checks
 * (`applications/web/src/lib/production-startup-requirements.ts`): the encrypted,
 * certificate-verified `rediss://` scheme, a non-loopback host, and no known placeholder
 * credential. Not exhaustive (matches the source's own "cheap check for the obvious mistake"
 * scope) — used only to keep `setupRailway` re-prompting instead of pushing a value production
 * will reject at startup.
 */
const knownPlaceholderRedisCredentials = new Set([
	'user:password',
	'admin:admin',
	'test:test',
	'postgres:postgres',
	'guest:guest',
	'root:root',
	'changeme:changeme',
]);
const loopbackRedisHostnames = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

export function isValidProductionRedisUrl(value: string): boolean {
	if (!value.startsWith('rediss://')) return false;
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		return false;
	}
	const host = parsed.hostname.toLowerCase();
	const unbracketed = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
	if (loopbackRedisHostnames.has(unbracketed)) return false;
	// Mirrors `databaseUrlFailures`'s `.localtest.me` suffix rejection
	// (`applications/web/src/lib/production-startup-requirements.ts`): `*.localtest.me` always
	// resolves to a loopback address (it is the local Docker/test-stack domain this repository's
	// own test scripts use, e.g. `db.localtest.me`), so it is exactly as local as the fixed
	// hostnames above even though it is not one of them literally.
	if (unbracketed.endsWith('.localtest.me')) return false;
	const credentials =
		parsed.username || parsed.password ? `${parsed.username}:${parsed.password}` : null;
	if (credentials && knownPlaceholderRedisCredentials.has(credentials.toLowerCase())) return false;
	return true;
}

/**
 * Mirrors `isValidCidr`'s syntax check (`applications/web/src/lib/trusted-proxy.ts`): a real
 * IPv4 or IPv6 range address with a prefix length that fits that family's address width. Uses
 * `node:net`'s `isIPv4`/`isIPv6` rather than importing the application module directly — that
 * module has no package export, and this is a shape sanity check for the prompt loop, not the
 * authoritative parser (`isAddressInCidr` at request time is).
 */
export function isValidTrustedProxyCidr(cidr: string): boolean {
	const parts = cidr.split('/');
	if (parts.length !== 2) return false;
	const [address, prefixLengthText] = parts;
	if (!address || !prefixLengthText || !/^\d+$/.test(prefixLengthText)) return false;
	const prefixLength = Number.parseInt(prefixLengthText, 10);
	if (isIPv4(address)) return prefixLength <= 32;
	if (isIPv6(address)) return prefixLength <= 128;
	return false;
}

/**
 * A comma-separated `TRUSTED_PROXY_CIDRS` value is valid only if every entry is — one malformed
 * entry silently matches no socket peer at request time, per `isAddressInCidr`'s documented
 * fail-closed behavior.
 */
export function isValidTrustedProxyCidrList(value: string): boolean {
	const entries = value
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	return entries.length > 0 && entries.every(isValidTrustedProxyCidr);
}

/**
 * Re-exported rather than reimplemented: `TRUSTED_PROXY_HOP_COUNT` is now a field on
 * `ProductionStartupConfiguration`, so real startup, `doctor`, and this Railway readiness gate
 * all reach the identical check. A setup-local mirror was the first version of this fix and was
 * exactly the drift the shared collector exists to prevent.
 */
export { isPositiveIntegerString as isValidTrustedProxyHopCount } from '@template/web/lib/production-startup-requirements';

const trustedProxyHeaderChoices = ['x-forwarded-for', 'forwarded', 'cf-connecting-ip'] as const;

export function isValidTrustedProxyHeader(
	value: string | undefined,
): value is (typeof trustedProxyHeaderChoices)[number] {
	return (
		value !== undefined &&
		trustedProxyHeaderChoices.includes(value as (typeof trustedProxyHeaderChoices)[number])
	);
}

/**
 * Same shape as `shouldPromptForBaseUrl` above: an existing value only excuses the phase from
 * prompting if it actually satisfies the same validator the prompt loop below enforces on a
 * freshly entered one.
 */
export function shouldPromptForTrustedProxyCidrs(existingValue: string | undefined): boolean {
	return existingValue === undefined || !isValidTrustedProxyCidrList(existingValue);
}

export function shouldPromptForTrustedProxyHeader(existingValue: string | undefined): boolean {
	return existingValue === undefined || !isValidTrustedProxyHeader(existingValue);
}

/**
 * `TRUSTED-PROXY-P1` (round 4 review): `assertProductionStartupInvariants` refuses production
 * startup unless both `TRUSTED_PROXY_CIDRS` and `TRUSTED_PROXY_HEADER` are set, but no phase
 * ever collected them — the same missing-phase defect `setupBaseUrl` above was added to fix for
 * `BASE_URL`. Collected here, before Railway is touched, for the same reason: failing the wizard
 * phase is cheaper than an operator discovering the deployed service won't boot.
 *
 * Review finding (P2): this used to skip both prompts on presence alone —
 * two nonempty but invalid values (`TRUSTED_PROXY_CIDRS=not-a-cidr`,
 * `TRUSTED_PROXY_HEADER=bogus`) satisfied the old `&&` check and were
 * copied straight through to Railway, where `assertProductionStartupInvariants`
 * rejects them at boot. Same predicate-driven fix `setupBaseUrl` already
 * applies to `BASE_URL`: validate an existing value with the same
 * validator the prompt loop uses, and only skip when it actually passes.
 */
async function setupTrustedProxy() {
	console.log('\n--- Trusted Proxy (production) ---\n');

	const existingCidrs = getEnvironmentValue('TRUSTED_PROXY_CIDRS');
	const existingHeader = getEnvironmentValue('TRUSTED_PROXY_HEADER');
	if (
		!shouldPromptForTrustedProxyCidrs(existingCidrs) &&
		!shouldPromptForTrustedProxyHeader(existingHeader)
	) {
		console.log('TRUSTED_PROXY_CIDRS and TRUSTED_PROXY_HEADER already exist in .env.local.');
		return;
	}

	if (existingCidrs && shouldPromptForTrustedProxyCidrs(existingCidrs)) {
		console.warn(
			`TRUSTED_PROXY_CIDRS already exists in .env.local but is not a valid comma-separated CIDR ` +
				`list: "${existingCidrs}". Replacing it.`,
		);
	}
	if (existingHeader && shouldPromptForTrustedProxyHeader(existingHeader)) {
		console.warn(
			`TRUSTED_PROXY_HEADER already exists in .env.local but is not one of ` +
				`${trustedProxyHeaderChoices.join(', ')}: "${existingHeader}". Replacing it.`,
		);
	}

	console.log("Production runs behind Railway's reverse proxy. Without both of these, rate");
	console.log("limiting and failed-authentication lockouts fall back to the proxy's own socket");
	console.log('address for every request, collapsing every real client onto one shared bucket.\n');
	console.log("Railway's edge proxy forwards the client address via the standard");
	console.log("X-Forwarded-For header; find Railway's current published proxy CIDR ranges in");
	console.log('their documentation before entering them here.\n');

	if (shouldPromptForTrustedProxyCidrs(existingCidrs)) {
		for (;;) {
			const input = await prompt('TRUSTED_PROXY_CIDRS (comma-separated, e.g. 10.0.0.0/8): ');
			if (!input || !isValidTrustedProxyCidrList(input)) {
				console.warn(
					'TRUSTED_PROXY_CIDRS is required and every entry must be a valid IPv4 or IPv6 CIDR ' +
						'(e.g. 10.0.0.0/8 or 2001:db8::/32). Try again.',
				);
				continue;
			}
			appendToEnvironmentFile('TRUSTED_PROXY_CIDRS', input);
			break;
		}
	}

	if (shouldPromptForTrustedProxyHeader(existingHeader)) {
		for (;;) {
			const input = await prompt(
				`TRUSTED_PROXY_HEADER (${trustedProxyHeaderChoices.join(' | ')}, default: x-forwarded-for): `,
			);
			const value = input || 'x-forwarded-for';
			if (!isValidTrustedProxyHeader(value)) {
				console.warn(
					`TRUSTED_PROXY_HEADER must be one of: ${trustedProxyHeaderChoices.join(', ')}.`,
				);
				continue;
			}
			appendToEnvironmentFile('TRUSTED_PROXY_HEADER', value);
			break;
		}
	}

	console.log('Trusted proxy configuration written to .env.local');
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
 * has meaning for a locally spawned `develop.ts --tunnel` process. `REDIS_URL` is excluded too —
 * not because it is local-only, but because the local dev default (`redis://localhost:6379`)
 * fails every one of `isValidProductionRedisUrl`'s checks; `setupRailway` below always supplies a
 * separately validated value via `planRailwayVariables`'s `overrides` parameter instead of
 * copying `.env.local`'s verbatim.
 */
export const RAILWAY_EXCLUDED_ENVIRONMENT_KEYS: ReadonlySet<string> = new Set([
	'NODE_ENV',
	'DATABASE_LOCAL_PROXY_URL',
	'PROTOKIT_TUNNEL_ACTIVE',
	'REDIS_URL',
]);

/**
 * Pure planning function for what `setupRailway` pushes: every non-empty `.env.local` entry
 * except the local-only keys above, plus an explicit `NODE_ENV=production` — never inferred from
 * whatever the developer's own `.env.local` happens to say, since a Railway service is production
 * by definition regardless of what mode the machine running `setup.ts` is in — and finally
 * `overrides`, values `setupRailway` collected and validated separately from `.env.local` (today:
 * a production-grade `REDIS_URL`). Overrides win over both the generic copy and `NODE_ENV`, so
 * they are applied last and de-duplicated against whatever the generic loop already added.
 */
export function planRailwayVariables(
	variables: Record<string, string | undefined>,
	overrides: Record<string, string> = {},
): Array<[string, string]> {
	const plan = new Map<string, string>();
	for (const [key, value] of Object.entries(variables)) {
		if (!value) continue;
		if (RAILWAY_EXCLUDED_ENVIRONMENT_KEYS.has(key)) continue;
		plan.set(key, value);
	}
	plan.set('NODE_ENV', 'production');
	for (const [key, value] of Object.entries(overrides)) {
		plan.set(key, value);
	}
	return [...plan.entries()];
}

/**
 * Review finding (P2): pure and exported (unlike `setupRailway`'s inline interactive logic)
 * specifically so it can be tested directly against a real `Record<string, string | undefined>`
 * and real `collectProductionStartupFailures`, rather than only by grepping `setupRailway`'s
 * source text for a function-call string the way the BASE_URL/TRUSTED_PROXY/REDIS checks above
 * are covered. Runs the exact same production-readiness collector `scripts/doctor.ts` uses
 * against the exact variable set `planRailwayVariables` would push to Railway — see
 * `setupRailway`'s own call site for the full rationale.
 */
export function collectRailwayProductionStartupFailures(
	variables: Record<string, string | undefined>,
	overrides: Record<string, string> = {},
): string[] {
	const plannedVariables = Object.fromEntries(planRailwayVariables(variables, overrides));
	const failures = collectProductionStartupFailures({
		nodeEnvironment: plannedVariables.NODE_ENV ?? '(not set)',
		baseUrl: plannedVariables.BASE_URL,
		redisUrl: plannedVariables.REDIS_URL,
		isRedisConfigured: plannedVariables.REDIS_URL !== undefined,
		databaseUrl: plannedVariables.DATABASE_URL ?? '',
		databaseUrlUnpooled: plannedVariables.DATABASE_URL_UNPOOLED,
		databaseLocalProxyUrl: plannedVariables.DATABASE_LOCAL_PROXY_URL,
		googleClientId: plannedVariables.GOOGLE_CLIENT_ID,
		googleClientSecret: plannedVariables.GOOGLE_CLIENT_SECRET,
		trustedProxyCidrs: plannedVariables.TRUSTED_PROXY_CIDRS,
		trustedProxyHeader: plannedVariables.TRUSTED_PROXY_HEADER,
		trustedProxyHopCount: plannedVariables.TRUSTED_PROXY_HOP_COUNT,
		nodeTlsRejectUnauthorized: plannedVariables.NODE_TLS_REJECT_UNAUTHORIZED,
		sessionSigningSecret: plannedVariables.SESSION_SIGNING_SECRET,
		mcpConformanceModeConfigured: plannedVariables.MCP_CONFORMANCE_MODE === 'true',
		mcpAllowedOrigins: plannedVariables.MCP_ALLOWED_ORIGINS,
	});

	return failures;
}

/**
 * B5: applies a planned Railway variable set one key at a time and returns the key names (never
 * values -- these scripts handle secrets and must never print, echo, or log one) that failed to
 * set. Pure with respect to how it decides success/failure and exported so it can be unit tested
 * with a fake `setVariable` that throws for a chosen key, instead of only exercising the real
 * `railway` CLI.
 *
 * Previously `setupRailway` caught each `railway variable set` failure inline, printed a warning,
 * and moved on -- so a transient failure setting a required value (SESSION_SIGNING_SECRET,
 * DATABASE_URL, NODE_ENV, ...) still let the loop finish and the unconditional
 * "Railway environment variables configured" success message print afterward, leaving Railway
 * with an incomplete or stale configuration while the phase reported success and returned
 * normally.
 */
export function applyPlannedRailwayVariables(
	plan: ReadonlyArray<readonly [string, string]>,
	setVariable: (key: string, value: string) => void,
): string[] {
	const failedKeys: string[] = [];
	for (const [key, value] of plan) {
		try {
			setVariable(key, value);
		} catch {
			failedKeys.push(key);
		}
	}
	return failedKeys;
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

	// `TRUSTED-PROXY-P1`: same fail-closed guard, for the same reason.
	if (!getEnvironmentValue('TRUSTED_PROXY_CIDRS') || !getEnvironmentValue('TRUSTED_PROXY_HEADER')) {
		console.error(
			'TRUSTED_PROXY_CIDRS and TRUSTED_PROXY_HEADER are not both set in .env.local. Production ' +
				'refuses to start without both (assertProductionStartupInvariants). Run ' +
				'`bun scripts/setup.ts trusted-proxy` first, then re-run this phase.',
		);
		process.exitCode = 1;
		return;
	}

	// `REDIS-PROD-P1` (round 4 review): the local dev default written by `setupRedis`
	// (`redis://localhost:6379`) is excluded from the generic copy above precisely because it
	// fails every production check. Collect a separately validated production endpoint here
	// instead of silently pushing the local one — an operator who already has a production Redis
	// URL in `.env.local` (because they edited it by hand) does not get re-prompted.
	const localRedisUrl = getEnvironmentValue('REDIS_URL');
	const railwayVariableOverrides: Record<string, string> = {};
	if (localRedisUrl && isValidProductionRedisUrl(localRedisUrl)) {
		railwayVariableOverrides.REDIS_URL = localRedisUrl;
	} else {
		console.log(
			'REDIS_URL in .env.local is the local development default and cannot be used in ' +
				'production (assertProductionStartupInvariants requires an encrypted, ' +
				'certificate-verified rediss:// endpoint on a non-local host).',
		);
		for (;;) {
			const input = await promptSecret('Production REDIS_URL (rediss://..., input hidden): ');
			if (!input || !isValidProductionRedisUrl(input)) {
				console.warn(
					'REDIS_URL must use rediss://, point at a non-local host, and carry no placeholder ' +
						'credentials. Try again.',
				);
				continue;
			}
			railwayVariableOverrides.REDIS_URL = input;
			break;
		}
	}

	// Review finding (P2): the three checks above (BASE_URL, TRUSTED_PROXY_CIDRS/HEADER, REDIS_URL)
	// each hand-roll ONE production invariant `assertProductionStartupInvariants` enforces at
	// real startup — the same shape fixed twice before for BASE_URL alone (rounds 4 and 9) and
	// once for trusted-proxy (round 11). They are not the complete set: this function was free to
	// skip past a missing GOOGLE_CLIENT_ID/SECRET, a DATABASE_URL without `sslmode=verify-full`,
	// a missing SESSION_SIGNING_SECRET, NODE_TLS_REJECT_UNAUTHORIZED=0, or MCP_CONFORMANCE_MODE
	// left on, silently copy the rest of `.env.local` to Railway, force NODE_ENV=production, and
	// report success — only for the deployed server to refuse to start, since all of those are
	// also required by `assertProductionStartupInvariants`.
	//
	// Rather than adding a fourth (fifth, sixth, ...) per-setting predicate here, this runs the
	// SAME shared `collectProductionStartupFailures` collector `scripts/doctor.ts` already uses
	// as its one production-readiness gate — against the EXACT variable set about to be pushed
	// (`planRailwayVariables`'s own planned output, not `.env.local`'s raw contents: those differ
	// in exactly the ways that matter here — `DATABASE_LOCAL_PROXY_URL`/`PROTOKIT_TUNNEL_ACTIVE`
	// are dropped, `REDIS_URL` is replaced with whatever was just validated/collected above, and
	// `NODE_ENV` is forced to `production`), as one final gate immediately before `railway init`
	// runs. The BASE_URL/TRUSTED_PROXY_* checks above are kept rather than deleted even though
	// this collector would also catch both — they run first specifically because they name the
	// exact `bun scripts/setup.ts <phase>` command to run next, which this generic collector's
	// messages do not; this final gate is the authoritative check that nothing else was missed,
	// not a replacement for that more actionable early guidance.
	const productionStartupFailures = collectRailwayProductionStartupFailures(
		readEnvironmentFile(),
		railwayVariableOverrides,
	);
	if (productionStartupFailures.length > 0) {
		console.error(
			'Refusing to configure Railway: the planned production configuration would fail ' +
				'assertProductionStartupInvariants at real startup —',
		);
		for (const failure of productionStartupFailures) {
			console.error(`  - ${failure}`);
		}
		console.error(
			'Fix these in .env.local (or the relevant `bun scripts/setup.ts` phase) and re-run.',
		);
		process.exitCode = 1;
		return;
	}

	console.log('\nInitializing Railway project...');
	try {
		execute('railway', ['init', '-y'], { stdio: 'inherit' });

		const variables = readEnvironmentFile();
		const failedKeys = applyPlannedRailwayVariables(
			planRailwayVariables(variables, railwayVariableOverrides),
			(key, value) => {
				// `--stdin` delivers the value over stdin rather than as an argv element, so a
				// credential never appears in `ps` output while Railway is configuring it.
				execute('railway', ['variable', 'set', key, '--stdin'], { input: value });
			},
		);
		if (failedKeys.length > 0) {
			console.error(
				`Failed to set the following Railway variable(s): ${failedKeys.join(', ')}. Railway's ` +
					'environment configuration is incomplete or stale — re-run `bun scripts/setup.ts ' +
					'railway` once the underlying issue is resolved.',
			);
			process.exitCode = 1;
			return;
		}
		console.log('Railway environment variables configured (NODE_ENV forced to production).');
	} catch {
		// B5 sibling: `railway init` itself failing (before any variable is even attempted) is the
		// same "phase must fail, not report success" shape as the variable-set failures above —
		// nothing here prints a false success message, but this used to return normally (exit code
		// 0) despite Railway never having been configured at all.
		console.error('Railway setup failed. Configure manually with: railway init');
		process.exitCode = 1;
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

		// `NEON-API-KEY-P1` (round 4 review): `.github/workflows/production.yml` passes
		// NEON_API_KEY to `neondatabase/create-branch-action` before every migration (the
		// mandatory rollback-branch snapshot), not only the PR-validation workflow. Skipping it
		// does not merely degrade PR checks — it fails every production deploy before migration
		// or `railway up` ever runs. Required, not skippable, once the operator has opted into
		// CI/CD configuration at all.
		for (;;) {
			const neonApiKey = await promptSecret(
				'NEON_API_KEY (required — used by both the PR and production workflows, input hidden): ',
			);
			if (!neonApiKey) {
				console.warn(
					'NEON_API_KEY is required: production.yml cannot create its pre-migration rollback ' +
						'branch without it, and every production deploy fails before migration. Try again.',
				);
				continue;
			}
			setGithubSecret('NEON_API_KEY', neonApiKey);
			break;
		}

		// `RAILWAY-TOKEN-P1` (round 4 review): production.yml's `deploy` job authenticates
		// exclusively with secrets.RAILWAY_TOKEN — a GitHub-hosted runner has no other login path.
		// Without this secret, every deploy this workflow triggers reaches `railway up`
		// unauthenticated and fails.
		for (;;) {
			const railwayToken = await promptSecret(
				"RAILWAY_TOKEN (required — the only credential production.yml's deploy job uses, input hidden): ",
			);
			if (!railwayToken) {
				console.warn(
					"RAILWAY_TOKEN is required: production.yml's deploy job has no other way to " +
						'authenticate with Railway on a GitHub-hosted runner. Try again.',
				);
				continue;
			}
			setGithubSecret('RAILWAY_TOKEN', railwayToken);
			break;
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
	console.log('\n=== Bun + Svelte MCP Template Setup ===\n');

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
	await setupTrustedProxy();
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
	'trusted-proxy': async () => {
		await setupTrustedProxy();
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
