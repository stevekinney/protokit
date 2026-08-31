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

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

	const probe = join(consumer, 'probe.mjs');
	await writeFile(
		probe,
		`import { createMcpServer, defineOAuthScopeConfiguration, defineScopes, getSupportedScopes, parseMcpServerEnvironment, runMcpConformance, PACKAGE_VERSION, EXTENSION_ID } from '@lostgradient/mcp';
import { logger as rootLogger, getLogger as rootGetLogger } from '@lostgradient/mcp';
import { logger as subpathLogger, getLogger as subpathGetLogger } from '@lostgradient/mcp/logger';
import * as oauthContract from '@lostgradient/mcp/oauth';
import * as oauthStoresContract from '@lostgradient/mcp/oauth/stores';
import { createInMemoryOAuthStores, InMemoryClientStore, InMemoryCodeStore, InMemoryTokenStore, InMemoryTransactionStore } from '@lostgradient/mcp/oauth/testing';
import { createPostgresOAuthSchema, createPostgresOAuthStores, PostgresClientStore, PostgresCodeStore, PostgresTokenStore, PostgresTransactionStore } from '@lostgradient/mcp/oauth/postgres';

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

// Every subpath in the exports map must resolve under Node.
for (const subpath of ['', '/logger', '/env', '/metrics', '/environment-schema', '/version', '/oauth', '/oauth/stores', '/oauth/testing', '/oauth/postgres']) {
  try { await import('@lostgradient/mcp' + subpath); }
  catch (error) { problems.push('subpath "' + (subpath || '.') + '" failed to import: ' + error.message); }
}

// The engine must be usable, not merely importable.
const vocabulary = defineScopes({ 'repositories:read': 'Read repository metadata.' });
const registry = vocabulary.defineRegistry({ tools: [], resources: [], prompts: [] });
require(Array.isArray(getSupportedScopes(registry)), 'getSupportedScopes did not return a list');
require(parseMcpServerEnvironment({ NODE_ENV: 'test' }).NODE_ENV === 'test', 'environment parsing failed');
require(Object.keys(oauthContract).length === 0, '/oauth must remain a type-only contract');
require(Object.keys(oauthStoresContract).length === 0, '/oauth/stores must remain a type-only contract');
require(typeof createInMemoryOAuthStores === 'function', 'createInMemoryOAuthStores is not a function');
require(typeof InMemoryTransactionStore === 'function', 'InMemoryTransactionStore is not a constructor');
require(typeof InMemoryCodeStore === 'function', 'InMemoryCodeStore is not a constructor');
require(typeof InMemoryTokenStore === 'function', 'InMemoryTokenStore is not a constructor');
require(typeof InMemoryClientStore === 'function', 'InMemoryClientStore is not a constructor');
require(typeof createPostgresOAuthSchema === 'function', 'createPostgresOAuthSchema is not a function');
require(typeof createPostgresOAuthStores === 'function', 'createPostgresOAuthStores is not a function');
require(typeof PostgresTransactionStore === 'function', 'PostgresTransactionStore is not a constructor');
require(typeof PostgresCodeStore === 'function', 'PostgresCodeStore is not a constructor');
require(typeof PostgresTokenStore === 'function', 'PostgresTokenStore is not a constructor');
require(typeof PostgresClientStore === 'function', 'PostgresClientStore is not a constructor');

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
