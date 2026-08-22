import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CONTENT-001: a build-time scan that rejects placeholder domains,
 * `YOUR_DOMAIN`, lorem ipsum, instructional TODO text, and the specific
 * placeholder-instructions phrasing this item removed, wherever this
 * project's own source could plausibly ship them into production. Scans
 * this workspace's authored source directories directly rather than the
 * compiled `dist/` bundle, which interleaves every third-party
 * dependency's own source and would make a dependency's legitimate
 * internal documentation (e.g. an SDK field description using
 * "example.com" as a documentation example) a false positive. Also checks
 * the production tool/resource/prompt registries for a conformance-fixture
 * or synthetic-demo operation. Run via `bun run audit:production-content`.
 */

export interface ForbiddenPattern {
	readonly description: string;
	readonly pattern: RegExp;
	// When set, this pattern only applies to files with one of these
	// extensions. Used for `example.com`/`YOUR_DOMAIN`: RFC 2606 reserves
	// `example.com` for documentation, and this codebase's `.ts` source
	// legitimately cites it in comments illustrating a spec format (CIMD
	// URLs) and in test fixtures (`test@example.com`, the standard reserved
	// test address). A real unfilled placeholder for *this* project only
	// matters in the config/documentation files a consumer actually edits —
	// `.md` and `.json`.
	readonly onlyForExtensions?: readonly string[];
}

// Every pattern is checked against the raw file text. Word-bounded where a
// bare substring could plausibly appear in legitimate prose (`TODO`/`FIXME`
// as a tracked-elsewhere marker, never as an unresolved stub) — this
// codebase's convention for a *legitimately deferred, tracked* item is a
// roadmap item ID in a comment (e.g. "owned by OBS-001"), never a bare
// TODO/FIXME marker.
export const FORBIDDEN_CONTENT_PATTERNS: readonly ForbiddenPattern[] = [
	{
		description: 'placeholder domain "example.com"',
		pattern: /example\.com/i,
		onlyForExtensions: ['.md', '.json'],
	},
	{
		description: 'unfilled registry placeholder "YOUR_DOMAIN"',
		pattern: /YOUR_DOMAIN/,
		onlyForExtensions: ['.md', '.json'],
	},
	{ description: 'lorem ipsum placeholder text', pattern: /lorem ipsum/i },
	{ description: 'unresolved TODO marker', pattern: /\bTODO\b:?/ },
	{ description: 'unresolved FIXME marker', pattern: /\bFIXME\b:?/ },
	{
		description: 'removed placeholder server instructions ("customize these instructions")',
		pattern: /customize these instructions/i,
	},
] as const;

// Workspace source directories this project authors and ships into the
// production artifact. Deliberately does NOT include the compiled
// `applications/web/dist/server.js` bundle or `dist/public` client
// bundle — those interleave every third-party dependency's own source
// (comments, documentation strings) with ours, and a dependency's
// legitimate internal documentation (e.g. an SDK's own field description
// using "example.com" as a documentation example) is not a defect in this
// codebase. Scanning our own authored source instead of the compiled
// output finds the same class of defect — a placeholder we wrote and
// forgot to fill in — without that false-positive surface.
const SOURCE_ROOTS = [
	'applications/web/src',
	'applications/web/public',
	'packages/mcp/src',
	'packages/database/src',
	'packages/mcp-apps/src',
];

// Only text file types are worth scanning; skip binary assets entirely
// (images, fonts) so the scan never reads garbage bytes as text.
const TEXT_FILE_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.md',
	'.json',
	'.css',
	'.html',
	'.txt',
	'.svg',
]);

/**
 * Every production artifact this scan reads. Deliberately excludes
 * `*.test.ts`/`*.test.tsx` (test fixtures legitimately use synthetic data
 * and are never shipped) and `*.example` files (`.env.example`,
 * `server.json.example`) — those are meant to carry placeholder values for
 * a consumer to replace, and are never served or shipped as-is.
 */
export function collectScanTargets(rootDirectory: string): string[] {
	const targets: string[] = [];

	for (const sourceRoot of SOURCE_ROOTS) {
		const sourceRootPath = join(rootDirectory, sourceRoot);
		if (!existsSync(sourceRootPath)) continue;
		for (const filePath of listFilesRecursively(sourceRootPath)) {
			if (filePath.includes('.example')) continue;
			if (/\.test\.tsx?$/.test(filePath)) continue;
			const extension = filePath.slice(filePath.lastIndexOf('.'));
			if (!TEXT_FILE_EXTENSIONS.has(extension)) continue;
			targets.push(filePath);
		}
	}

	// The real, filled-in registry descriptor a consumer creates locally
	// (git-ignored — see `.gitignore`). Only scanned when present; CI never
	// has one. `server.json.example` is deliberately not scanned — its
	// placeholder values are the whole point of that file.
	const registryDescriptor = join(rootDirectory, 'server.json');
	if (existsSync(registryDescriptor)) targets.push(registryDescriptor);

	return targets;
}

function listFilesRecursively(directory: string): string[] {
	const results: string[] = [];
	for (const entry of readdirSync(directory)) {
		const entryPath = join(directory, entry);
		const entryStatistics = statSync(entryPath);
		if (entryStatistics.isDirectory()) {
			results.push(...listFilesRecursively(entryPath));
		} else {
			results.push(entryPath);
		}
	}
	return results;
}

export interface ContentViolation {
	readonly file: string;
	readonly description: string;
}

export function scanFileContentsForViolations(
	filePath: string,
	fileContents: string,
): ContentViolation[] {
	const extension = filePath.slice(filePath.lastIndexOf('.'));
	const violations: ContentViolation[] = [];
	for (const forbidden of FORBIDDEN_CONTENT_PATTERNS) {
		if (forbidden.onlyForExtensions && !forbidden.onlyForExtensions.includes(extension)) continue;
		if (forbidden.pattern.test(fileContents)) {
			violations.push({ file: filePath, description: forbidden.description });
		}
	}
	return violations;
}

/**
 * Registry-level check, complementing the wire-level assertion in
 * `packages/mcp/src/metadata-contract.test.ts`: the *production* tool,
 * resource, and prompt registries must contain no protocol-conformance
 * fixture (`test_*` naming convention) and no synthetic demo-data
 * operation (`list_audit_events`). Static — reads the arrays directly,
 * no server or client needed.
 */
export function findProductionRegistryViolations(names: readonly string[]): string[] {
	return names.filter((name) => name.startsWith('test_') || name === 'list_audit_events');
}

async function runAudit(): Promise<void> {
	const rootDirectory = process.cwd();
	const targets = collectScanTargets(rootDirectory);

	if (targets.length === 0) {
		console.error(
			'[audit:production-content] FAIL: found no source files under the expected workspace directories. This is unexpected and likely means the script is not being run from the repository root.',
		);
		process.exit(1);
	}

	let violations: ContentViolation[] = [];
	for (const target of targets) {
		const fileContents = await Bun.file(target).text();
		violations = violations.concat(scanFileContentsForViolations(target, fileContents));
	}

	const { allTools, allResources, allPrompts } = await import('@template/mcp');

	const registryNames = [
		...allTools.map((tool) => tool.name),
		...allResources.map((resource) => resource.name),
		...allPrompts.map((prompt) => prompt.name),
	];
	const registryViolations = findProductionRegistryViolations(registryNames);

	if (violations.length === 0 && registryViolations.length === 0) {
		console.log(
			`[audit:production-content] ok: scanned ${targets.length} artifact(s) and the production registry, no placeholder or test-only content found`,
		);
		return;
	}

	console.error('[audit:production-content] FAIL:');
	for (const violation of violations) {
		console.error(`  ${violation.file}: ${violation.description}`);
	}
	for (const name of registryViolations) {
		console.error(
			`  production registry: "${name}" looks like a conformance fixture or synthetic demo operation`,
		);
	}
	process.exit(1);
}

if (import.meta.main) {
	await runAudit();
}
