#!/usr/bin/env bun
/**
 * Prove the packed tarball installs and imports before it is published.
 *
 * TRI-74's acceptance criterion is explicit that a green build is not
 * evidence: the package must be installable "from a clean directory outside
 * this repository, with no private-registry configuration and no
 * authentication — an install that only works with this machine's npm
 * credentials has not verified anything a consumer cares about."
 *
 * That wording earned its place. Writing this package's build surfaced two
 * defects that a build, a typecheck, and the full test suite all missed, and
 * that only installing the artifact could reveal:
 *
 * - The bundler emitted `export { EXTENSION_ID }` with no corresponding
 *   import for a re-export whose module was external, and Node rejected the
 *   module with "Export 'EXTENSION_ID' is not defined in module".
 * - Each entry point bundled its own copy of the shared modules, so `logger`
 *   imported from the package root was a different object from the one
 *   imported via the `/logger` subpath.
 *
 * The temporary directory is deliberately outside the repository: inside it,
 * workspace resolution would satisfy imports that a real consumer cannot.
 * Node runs the import rather than Bun, because Bun tolerates module shapes
 * Node rejects and the point is to catch exactly that difference.
 *
 * A temporary directory alone does not deliver the "no authentication"
 * half. npm still reads the per-user `~/.npmrc`, the global config, and
 * `npm_config_*` environment variables wherever it runs, so a developer token
 * or a scoped private-registry mapping could make this pass where an
 * anonymous consumer fails. The install therefore runs with an empty
 * `--userconfig` and `--globalconfig`, the public registry named explicitly,
 * and every npm auth-bearing environment variable stripped.
 */

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const packageRoot = import.meta.dir;

/**
 * `process.env` with every npm credential and registry override removed, so an
 * ambient token cannot satisfy an install an anonymous consumer could not.
 */
function anonymousEnvironment(): Record<string, string> {
	const environment: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value === undefined) continue;
		const lower = key.toLowerCase();
		if (lower.startsWith('npm_config_')) continue;
		if (lower === 'npm_token' || lower === 'node_auth_token') continue;
		environment[key] = value;
	}
	return environment;
}

function run(command: string[], cwd: string, env?: Record<string, string>): string {
	const result = Bun.spawnSync(command, {
		cwd,
		stdout: 'pipe',
		stderr: 'pipe',
		...(env ? { env } : {}),
	});
	const stdout = new TextDecoder().decode(result.stdout);
	const stderr = new TextDecoder().decode(result.stderr);
	if (result.exitCode !== 0) {
		console.error(`\n$ ${command.join(' ')}  (in ${cwd})`);
		console.error(stdout);
		console.error(stderr);
		throw new Error(`${command[0]} failed with exit code ${result.exitCode}.`);
	}
	return stdout.trim();
}

async function listFilesRecursively(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await listFilesRecursively(path)));
		else files.push(path);
	}
	return files;
}

function collectDependencyNames(tree: unknown, names = new Set<string>()): Set<string> {
	if (typeof tree !== 'object' || tree === null) return names;
	const dependencies = (tree as { dependencies?: unknown }).dependencies;
	if (typeof dependencies !== 'object' || dependencies === null) return names;
	for (const [name, dependency] of Object.entries(dependencies)) {
		names.add(name);
		collectDependencyNames(dependency, names);
	}
	return names;
}

const consumer = await mkdtemp(join(tmpdir(), 'lostgradient-mcp-consumer-'));

try {
	run(['bun', 'run', 'build'], packageRoot);

	const packed = run(['npm', 'pack', '--pack-destination', consumer, '--silent'], packageRoot)
		.split('\n')
		.at(-1);
	if (!packed) throw new Error('npm pack did not report a tarball name.');

	await writeFile(
		join(consumer, 'package.json'),
		`${JSON.stringify({ name: 'clean-consumer', private: true, type: 'module', version: '1.0.0' }, null, 2)}\n`,
	);

	// `--no-audit --no-fund` for output that is readable in CI; nothing here
	// suppresses a failure. The empty config files and explicit public registry
	// are what make "no private-registry configuration and no authentication"
	// true rather than merely intended.
	// Two distinct files: npm refuses to load one path as both the user and
	// the global config ("double-loading config ... as global, previously
	// loaded as user") and exits before resolving anything.
	const emptyUserConfig = join(consumer, 'empty-user.npmrc');
	const emptyGlobalConfig = join(consumer, 'empty-global.npmrc');
	await writeFile(emptyUserConfig, '');
	await writeFile(emptyGlobalConfig, '');
	run(
		[
			'npm',
			'install',
			join(consumer, packed),
			'--no-audit',
			'--no-fund',
			'--userconfig',
			emptyUserConfig,
			'--globalconfig',
			emptyGlobalConfig,
			'--registry',
			'https://registry.npmjs.org/',
		],
		consumer,
		anonymousEnvironment(),
	);

	const installedPackageRoot = join(consumer, 'node_modules', '@lostgradient', 'mcp');
	const installedDependencyTree = JSON.parse(
		run(['npm', 'ls', '--all', '--json'], consumer, anonymousEnvironment()),
	) as unknown;
	const templateDependencies = [...collectDependencyNames(installedDependencyTree)].filter((name) =>
		name.startsWith('@template/'),
	);
	if (templateDependencies.length > 0) {
		throw new Error(
			`Packed artifact installed private template dependencies: ${templateDependencies.join(', ')}.`,
		);
	}

	const installedJavaScriptFiles = (
		await listFilesRecursively(join(installedPackageRoot, 'dist'))
	).filter((path) => path.endsWith('.js'));
	for (const path of installedJavaScriptFiles) {
		const source = await readFile(path, 'utf8');
		if (/\bwith\s*\{\s*type\s*:/.test(source)) {
			throw new Error(`Import-attribute syntax survived in the packed artifact: ${path}.`);
		}
	}

	const probe = join(consumer, 'probe.mjs');
	await writeFile(
		probe,
		`import { createMcpServer, defineOAuthScopeConfiguration, defineScopes, getSupportedScopes, parseMcpServerEnvironment, runMcpConformance, PACKAGE_VERSION, EXTENSION_ID } from '@lostgradient/mcp';
import { logger as rootLogger, getLogger as rootGetLogger, setLogger as rootSetLogger } from '@lostgradient/mcp';
import { logger as subpathLogger, getLogger as subpathGetLogger, setLogger as subpathSetLogger } from '@lostgradient/mcp/logger';
import * as oauthContract from '@lostgradient/mcp/oauth';
import * as clientMetadataDocuments from '@lostgradient/mcp/oauth/client-metadata-documents';
import * as oauthStoresContract from '@lostgradient/mcp/oauth/stores';
import { createInMemoryOAuthStores, InMemoryClientStore, InMemoryCodeStore, InMemoryTokenStore, InMemoryTransactionStore } from '@lostgradient/mcp/oauth/testing';
import { createPostgresOAuthSchema, createPostgresOAuthStores, PostgresClientStore, PostgresCodeStore, PostgresTokenStore, PostgresTransactionStore } from '@lostgradient/mcp/oauth/postgres';
import { createInMemorySlidingWindowStore, createRateLimitedResponse, RequestRateLimiter } from '@lostgradient/mcp/rate-limit';
import { buildMcpAuthInfo, createMcpHttpServingLayer, createMcpServingHandler, McpUserHandlerCache } from '@lostgradient/mcp/http';
import * as svelteKitContract from '@lostgradient/mcp/sveltekit';

const problems = [];
const require = (condition, message) => { if (!condition) problems.push(message); };

require(typeof createMcpServer === 'function', 'createMcpServer is not a function');
require(typeof defineOAuthScopeConfiguration === 'function', 'defineOAuthScopeConfiguration is not a function');
require(typeof defineScopes === 'function', 'defineScopes is not a function');
require(typeof runMcpConformance === 'function', 'runMcpConformance is not a function');
require(typeof parseMcpServerEnvironment === 'function', 'parseMcpServerEnvironment is not a function');
require(typeof PACKAGE_VERSION === 'string' && PACKAGE_VERSION.length > 0, 'PACKAGE_VERSION is missing');
require(typeof EXTENSION_ID === 'string' && EXTENSION_ID.length > 0, 'EXTENSION_ID lost its binding through the bundler');

// Shared modules must be shared chunks, not per-entry copies.
require(rootLogger === subpathLogger, 'logger differs between the root export and the /logger subpath');
require(rootGetLogger === subpathGetLogger, 'getLogger differs between the root export and the /logger subpath');
require(rootSetLogger === subpathSetLogger, 'setLogger differs between the root export and the /logger subpath');

// Every subpath in the exports map must resolve under Node.
for (const subpath of ['', '/logger', '/env', '/metrics', '/environment-schema', '/version', '/oauth', '/oauth/stores', '/oauth/testing', '/oauth/postgres', '/oauth/client-metadata-documents', '/rate-limit', '/http', '/sveltekit']) {
  try { await import('@lostgradient/mcp' + subpath); }
  catch (error) { problems.push('subpath "' + (subpath || '.') + '" failed to import: ' + error.message); }
}

// The engine must be usable, not merely importable.
const vocabulary = defineScopes({ 'repositories:read': 'Read repository metadata.' });
const protectedResource = vocabulary.defineResource({
  name: 'private_repository',
  title: 'Private repository',
  uri: 'repository://private',
  description: 'A repository visible only with the consumer-defined scope.',
  mimeType: 'application/json',
  requiredScope: 'repositories:read',
  handler: async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: '{}' }] }),
});
const registry = vocabulary.defineRegistry({ tools: [], resources: [protectedResource], prompts: [] });
require(Array.isArray(getSupportedScopes(registry)), 'getSupportedScopes did not return a list');
require(
  parseMcpServerEnvironment({ NODE_ENV: 'test', MCP_SERVER_NAME: 'packed-consumer-mcp-server' }).NODE_ENV === 'test',
  'environment parsing failed',
);
require(typeof oauthContract.safeFetchPublicHttpsUrl === 'function', '/oauth safe fetch is not a function');
require(typeof oauthContract.isAddressInCidr === 'function', '/oauth CIDR matcher is not a function');
require(typeof oauthContract.isValidRedirectUri === 'function', '/oauth redirect validator is not a function');
require(typeof oauthContract.isValidClientName === 'function', '/oauth client-name validator is not a function');
require(typeof oauthContract.isExactContentType === 'function', '/oauth content-type validator is not a function');
require(typeof oauthContract.constantTimeEquals === 'function', '/oauth constant-time comparison is not a function');
require(typeof oauthContract.isValidPkceCodeVerifier === 'function', '/oauth PKCE verifier validator is not a function');
require(typeof oauthContract.resolveOauthNetworkIdentity === 'function', '/oauth network identity resolver is not a function');
require(typeof oauthContract.authenticateOauthClient === 'function', '/oauth client authenticator is not a function');
require(typeof oauthContract.handleOauthRegisterPost === 'function', '/oauth registration handler is not a function');
require(typeof oauthContract.handleOauthAuthorizeGet === 'function', '/oauth authorization GET handler is not a function');
require(typeof oauthContract.handleOauthAuthorizeApprove === 'function', '/oauth authorization approval handler is not a function');
require(typeof oauthContract.handleOauthAuthorizeDeny === 'function', '/oauth authorization denial handler is not a function');
require(Array.isArray(oauthContract.authorizeFormParameterNames) && oauthContract.authorizeFormParameterNames.join(',') === 'transaction_id,csrf_token', '/oauth authorization form allowlist is incorrect');
require(typeof oauthContract.handleOauthTokenPost === 'function', '/oauth token handler is not a function');
require(typeof oauthContract.handleOauthRevokePost === 'function', '/oauth revocation handler is not a function');
require(typeof oauthContract.withDeadline === 'function', '/oauth deadline helper is not a function');
require(typeof clientMetadataDocuments.fetchClientIdMetadataDocument === 'function', '/oauth/client-metadata-documents fetcher is not a function');
require(clientMetadataDocuments.safeFetchPublicHttpsUrl === oauthContract.safeFetchPublicHttpsUrl, 'safe fetch differs between /oauth and the dedicated subpath');
require(Object.keys(oauthStoresContract).length === 0, '/oauth/stores must remain a type-only contract');
require(typeof createInMemoryOAuthStores === 'function', 'createInMemoryOAuthStores is not a function');
require(typeof InMemoryTransactionStore === 'function', 'InMemoryTransactionStore is not a constructor');
require(typeof InMemoryCodeStore === 'function', 'InMemoryCodeStore is not a constructor');
require(typeof InMemoryTokenStore === 'function', 'InMemoryTokenStore is not a constructor');
require(typeof InMemoryClientStore === 'function', 'InMemoryClientStore is not a constructor');
require(typeof createPostgresOAuthSchema === 'function', 'createPostgresOAuthSchema is not a function');
require(typeof createPostgresOAuthStores === 'function', 'createPostgresOAuthStores is not a function');
require(typeof PostgresTransactionStore === 'function', 'PostgresTransactionStore is not a constructor');
require(typeof createInMemorySlidingWindowStore === 'function', 'createInMemorySlidingWindowStore is not a function');
require(typeof createRateLimitedResponse === 'function', 'createRateLimitedResponse is not a function');
require(typeof RequestRateLimiter === 'function', 'RequestRateLimiter is not a constructor');
require(typeof createMcpHttpServingLayer === 'function', '/http createMcpHttpServingLayer is not a function');
require(typeof createMcpServingHandler === 'function', '/http createMcpServingHandler is not a function');
require(typeof McpUserHandlerCache === 'function', '/http McpUserHandlerCache is not a constructor');
require(typeof svelteKitContract.createSvelteKitMcpMount === 'function', '/sveltekit createSvelteKitMcpMount is not a function');
require(typeof svelteKitContract.primeSvelteKitMcpIdentity === 'function', '/sveltekit primeSvelteKitMcpIdentity is not a function');
require(!('svelteKitMountTestHooks' in svelteKitContract), '/sveltekit exposes internal test hooks');
require(typeof PostgresCodeStore === 'function', 'PostgresCodeStore is not a constructor');
require(typeof PostgresTokenStore === 'function', 'PostgresTokenStore is not a constructor');
require(typeof PostgresClientStore === 'function', 'PostgresClientStore is not a constructor');

// The library-owned HTTP boundary must enforce a consumer registry's resource
// scopes for subscriptions/listen. A host must not reproduce this check.
const servingEvents = [];
const servingHandler = createMcpServingHandler({
  registry,
  configuration: {
    protocolVersion: '2026-07-28',
    maximumRequestBodyBytes: 64 * 1024,
    maximumSubscriptionsPerUser: 10,
    userHandlerSweepIntervalMilliseconds: 60_000,
    userHandlerIdleMilliseconds: 60_000,
    enableUiExtension: false,
    enableConformanceMode: false,
  },
  seams: {
    reportDegradation: () => {},
    recordEvent: (outcome) => servingEvents.push(outcome),
    onError: (error) => problems.push('serving handler error: ' + String(error)),
  },
});
const underScopedListenResponse = await servingHandler.handle(
  new Request('https://consumer.example/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'subscriptions/listen',
      params: { notifications: { resourceSubscriptions: ['repository://private'] } },
    }),
  }),
  buildMcpAuthInfo({
    accessToken: 'packed-artifact-token',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    extra: {
      userId: 'packed-artifact-user',
      userProfile: {
        id: 'packed-artifact-user',
        email: 'user@example.com',
        name: 'Packed Artifact User',
        image: null,
        role: 'user',
      },
      oauthClientId: 'packed-artifact-client',
      scopes: [],
      resource: 'https://consumer.example/mcp',
      requestId: 'packed-artifact-request',
    },
  }),
);
require(underScopedListenResponse.status === 403, 'library HTTP boundary did not reject an under-scoped subscription');
require(servingEvents.includes('insufficient_scope'), 'library HTTP boundary did not record insufficient_scope');
await servingHandler.shutdown();

if (problems.length > 0) {
  console.error('Packaged artifact is not consumable:');
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}
console.log('Packaged artifact verified on Node ' + process.version + ': ' + PACKAGE_VERSION);
`,
	);

	// Importing with no MCP environment set is part of the contract: this
	// package must not read `process.env` at import time.
	const output = run(['node', probe], consumer);
	console.log(output);
} finally {
	await rm(consumer, { recursive: true, force: true });
}
