#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import {
	collectDocumentationTargets,
	extractReferencedScriptNames,
} from './audit-documentation.js';

/**
 * `DOCS-001`: the dynamic half of the documentation gate.
 * `audit:documentation` proves every `bun run <name>` this repository's
 * documentation names is a real script in the root `package.json`;
 * this script goes one step further and actually EXECUTES the subset of
 * those commands that are safe to run in this environment, so a documented
 * command that no longer works as written (a renamed flag, a moved file, a
 * script that now requires an argument it didn't before) is caught here
 * rather than trusted on the strength of its name existing.
 *
 * Deliberately does NOT run every documented command. This repository's
 * Postgres/Redis/Neon-proxy test stack is shared infrastructure other
 * agents and CI jobs depend on concurrently — this script must never start,
 * stop, or migrate it (`test:infrastructure:up/down/migrate`), must never
 * build or run a Docker image (`test:container-smoke`, any `docker`
 * command), must never start a long-running dev server (`bun turbo dev`),
 * and must never hit a real, undeployed host
 * (`test:deployed-smoke -- https://HOST`). Every command in
 * `EXCLUDED_FROM_EXECUTION` below is named explicitly and reasoned about —
 * an unexplained skip is exactly the failure mode this repository's own
 * conventions call out as worse than a real failure, so the exclusion list
 * is exhaustive and hard-asserted against every command this scan actually
 * finds, rather than an implicit "everything not on the safe list is
 * quietly skipped."
 */

/**
 * Every documented command this script actually runs, and why each one is
 * safe: pure static checks (typecheck, lint, `doctor` in an environment
 * this script itself supplies) with no persistent side effect and no
 * dependency on the shared infrastructure stack.
 */
export const SAFE_TO_EXECUTE: Readonly<
	Record<string, { command: string; args: string[]; env?: Record<string, string> }>
> = {
	doctor: {
		command: 'bun',
		args: ['scripts/doctor.ts', '--production'],
		// A deliberately incomplete production-shaped environment — this
		// proves the command runs and reports failures the way the docs
		// describe, not that this particular environment is fully
		// configured (it never will be in CI).
		env: { NODE_ENV: 'production', BASE_URL: 'https://documentation-check.invalid' },
	},
	'audit:documentation': { command: 'bun', args: ['run', 'audit:documentation'] },
	'audit:production-content': { command: 'bun', args: ['run', 'audit:production-content'] },
	'audit:logs': { command: 'bun', args: ['run', 'audit:logs'] },
	// Pure comparison between checked-in environment schemas and turbo.json;
	// it reads files and reports drift without writing artifacts.
	'audit:turbo-env': { command: 'bun', args: ['run', 'audit:turbo-env'] },
	'test:metadata': { command: 'bun', args: ['run', 'test:metadata'] },
	// Pure packages/mcp registry consistency check -- no database, no Redis,
	// no shared infrastructure, exactly like `test:metadata` above.
	'test:golden-prompts': { command: 'bun', args: ['run', 'test:golden-prompts'] },
};

/**
 * Every documented command this script deliberately does NOT execute, with
 * the reason. This list must be exact: a command this scan finds in the
 * documentation that is neither in `SAFE_TO_EXECUTE` nor here fails the run
 * loudly rather than being silently skipped.
 */
export const EXCLUDED_FROM_EXECUTION: Readonly<Record<string, string>> = {
	dev: 'starts a long-running dev server that never exits',
	'turbo dev': 'starts a long-running dev server that never exits',
	build:
		'produces build artifacts as a side effect; covered by the release-gate build step directly, not this script',
	'turbo build':
		'produces build artifacts as a side effect; covered by the release-gate build step directly',
	test: "the full suite is the release gate itself, not this script's job to re-run",
	'turbo test': "the full suite is the release gate itself, not this script's job to re-run",
	typecheck: 'covered by the release-gate typecheck step directly, not this script',
	'turbo typecheck': 'covered by the release-gate typecheck step directly',
	lint: 'covered by the release-gate lint step directly, not this script',
	'turbo lint': 'covered by the release-gate lint step directly',
	format: 'mutates files in place; never safe to run unattended in a check script',
	'turbo format': 'mutates files in place; never safe to run unattended in a check script',
	'db:generate': 'writes a new migration file as a side effect',
	'turbo db:generate': 'writes a new migration file as a side effect',
	'db:validate': 'requires a real database connection this script does not have',
	'turbo db:validate': 'requires a real database connection this script does not have',
	'test:infrastructure:up':
		'starts the shared Postgres/Redis/Neon-proxy stack — never restart shared infrastructure from an unattended check',
	'test:infrastructure:down':
		'stops the shared Postgres/Redis/Neon-proxy stack — never restart shared infrastructure from an unattended check',
	'test:infrastructure:migrate': 'applies migrations against the shared test stack',
	'test:container-smoke': 'builds and runs a Docker image',
	'test:deployed-smoke': 'requires a real, deployed --host argument this script does not have',
	'test:oauth:interop': 'requires the shared Postgres/Redis/Neon-proxy stack',
	'test:security': 'requires the shared Postgres/Redis/Neon-proxy stack',
	'test:rate-limit-concurrency': 'requires the shared Postgres/Redis/Neon-proxy stack',
	'test:request-boundaries': 'requires the shared Postgres/Redis/Neon-proxy stack',
	'test:browser-security': 'requires the shared Postgres/Redis/Neon-proxy stack',
	'test:coverage':
		"runs the full suite with coverage instrumentation; the release gate's job, not this script's",
	'test:integration': 'requires the shared Postgres/Redis/Neon-proxy stack',
	'test:conformance:modern': 'boots a real server process and runs an external conformance CLI',
	'test:conformance:legacy': 'boots a real server process and runs an external conformance CLI',
	'test:connector:codex':
		'invokes the real Codex CLI, which is not guaranteed installed in every environment this script runs in',
	'test:connector:claude-code':
		'invokes the real Claude Code CLI, which is not guaranteed installed in every environment this script runs in',
	'audit:secrets':
		"requires the gitleaks CLI, which is not guaranteed installed, and scans the full commit history, which is slow — covered directly by the release-gate's own audit:secrets step",
	'test:observability':
		'requires a reachable Postgres instance at a fixed test connection string this script does not control',
	'test:connector:inspector':
		'invokes the real MCP Inspector CLI and self-hosts a real server against the shared Postgres/Redis/Neon-proxy stack, matching test:connector:codex/claude-code',
	'test:deployed-streaming': 'requires a real, deployed --host argument this script does not have',
	'test:deployed-oauth': 'requires a real, deployed --host argument this script does not have',
	'test:graceful-shutdown':
		'spawns a real subprocess against the shared Postgres/Redis/Neon-proxy stack, matching test:oauth:interop',
	'test:error-disclosure':
		'requires a reachable Postgres instance at a fixed test connection string this script does not control',
	'test:documentation-commands':
		'this script itself -- running itself recursively from inside its own command scan would be circular, not a real check',
};

async function runCommandsExtractedFromDocumentation(): Promise<void> {
	const rootDirectory = process.cwd();
	const targets = collectDocumentationTargets(rootDirectory);

	const allReferencedScripts = new Set<string>();
	for (const target of targets) {
		const fileContents = await Bun.file(target).text();
		for (const name of extractReferencedScriptNames(fileContents)) {
			allReferencedScripts.add(name);
		}
	}

	const unaccountedFor = [...allReferencedScripts].filter(
		(name) => !(name in SAFE_TO_EXECUTE) && !(name in EXCLUDED_FROM_EXECUTION),
	);

	if (unaccountedFor.length > 0) {
		console.error(
			'[test:documentation-commands] FAIL: the documentation references a command this script does not know how to classify. Add it to SAFE_TO_EXECUTE (with a reason it is safe) or EXCLUDED_FROM_EXECUTION (with a reason it is not) in scripts/test-documentation-commands.ts:',
		);
		for (const name of unaccountedFor) {
			console.error(`  - ${name}`);
		}
		process.exit(1);
	}

	let failures = 0;
	for (const [name, spec] of Object.entries(SAFE_TO_EXECUTE)) {
		if (!allReferencedScripts.has(name)) continue;
		console.log(`[test:documentation-commands] running documented command: bun run ${name}`);
		const result = spawnSync(spec.command, spec.args, {
			cwd: rootDirectory,
			env: { ...process.env, ...spec.env },
			encoding: 'utf-8',
		});
		// `doctor --production` is EXPECTED to exit nonzero against an
		// intentionally incomplete environment — this script is proving the
		// command runs and reports as documented, not that this environment
		// passes every production check.
		const acceptableExitCodes = name === 'doctor' ? [0, 1] : [0];
		if (!acceptableExitCodes.includes(result.status ?? -1)) {
			failures += 1;
			console.error(
				`[test:documentation-commands] FAIL: "bun run ${name}" exited ${result.status} (expected one of ${acceptableExitCodes.join(', ')})`,
			);
			console.error(result.stdout);
			console.error(result.stderr);
		} else {
			console.log(`[test:documentation-commands] ok: bun run ${name}`);
		}
	}

	if (failures > 0) {
		console.error(
			`[test:documentation-commands] FAIL: ${failures} documented command(s) did not run as documented.`,
		);
		process.exit(1);
	}

	console.log(
		`[test:documentation-commands] ok: ${allReferencedScripts.size} documented command(s) accounted for, every safely-executable one ran successfully.`,
	);
}

if (import.meta.main) {
	await runCommandsExtractedFromDocumentation();
}
