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
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const packageRoot = import.meta.dir;

function run(command: string[], cwd: string): string {
	const result = Bun.spawnSync(command, { cwd, stdout: 'pipe', stderr: 'pipe' });
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
	// suppresses a failure.
	run(['npm', 'install', join(consumer, packed), '--no-audit', '--no-fund'], consumer);

	const probe = join(consumer, 'probe.mjs');
	await writeFile(
		probe,
		`import { createMcpServer, defineScopes, getSupportedScopes, parseMcpServerEnvironment, PACKAGE_VERSION, EXTENSION_ID } from '@lostgradient/mcp';
import { logger as rootLogger, getLogger as rootGetLogger } from '@lostgradient/mcp';
import { logger as subpathLogger, getLogger as subpathGetLogger } from '@lostgradient/mcp/logger';

const problems = [];
const require = (condition, message) => { if (!condition) problems.push(message); };

require(typeof createMcpServer === 'function', 'createMcpServer is not a function');
require(typeof defineScopes === 'function', 'defineScopes is not a function');
require(typeof parseMcpServerEnvironment === 'function', 'parseMcpServerEnvironment is not a function');
require(typeof PACKAGE_VERSION === 'string' && PACKAGE_VERSION.length > 0, 'PACKAGE_VERSION is missing');
require(typeof EXTENSION_ID === 'string' && EXTENSION_ID.length > 0, 'EXTENSION_ID lost its binding through the bundler');

// Shared modules must be shared chunks, not per-entry copies.
require(rootLogger === subpathLogger, 'logger differs between the root export and the /logger subpath');
require(rootGetLogger === subpathGetLogger, 'getLogger differs between the root export and the /logger subpath');

// Every subpath in the exports map must resolve under Node.
for (const subpath of ['', '/logger', '/env', '/metrics', '/environment-schema', '/version']) {
  try { await import('@lostgradient/mcp' + subpath); }
  catch (error) { problems.push('subpath "' + (subpath || '.') + '" failed to import: ' + error.message); }
}

// The engine must be usable, not merely importable.
const vocabulary = defineScopes({ 'repositories:read': 'Read repository metadata.' });
const registry = vocabulary.defineRegistry({ tools: [], resources: [], prompts: [] });
require(Array.isArray(getSupportedScopes(registry)), 'getSupportedScopes did not return a list');
require(parseMcpServerEnvironment({ NODE_ENV: 'test' }).NODE_ENV === 'test', 'environment parsing failed');

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
