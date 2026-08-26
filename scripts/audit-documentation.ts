#!/usr/bin/env bun
import { readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * `DOCS-001`: a static audit of the repository's own operator/developer
 * documentation — the checked-in `.md` files at the repo root, every
 * `CLAUDE.md`, and every skill's `SKILL.md` under `.claude/skills` — for exactly the
 * class of drift that made most of `PROGRESS.local.md`'s documented
 * defects: a doc that quietly kept describing an architecture, package, or
 * grant type a later item removed. `audit:production-content` (`CONTENT-001`)
 * already covers this project's own *authored source* for placeholder
 * content; this script covers the *documentation* surface that scan
 * deliberately never reads.
 *
 * Deliberately excludes `PROGRESS.local.md`, `ROADMAP.local.md`, and
 * `.roadmap-progress/*.md` — those are historical wave logs and an audit
 * document that legitimately name a removed API (`client_credentials`,
 * `SKIP_ENV_VALIDATION`, the v1 SDK) as history, describing what changed
 * and why, never as current-state guidance. Flagging them would punish the
 * exact record-keeping this repository's own conventions require.
 */

export interface ForbiddenDocumentationPattern {
	readonly description: string;
	readonly pattern: RegExp;
	readonly onlyForExtensions?: readonly string[];
}

export const FORBIDDEN_DOCUMENTATION_PATTERNS: readonly ForbiddenDocumentationPattern[] = [
	{
		description:
			'references the removed v1 MCP SDK package (@modelcontextprotocol/sdk) as if it were current — this template is on the v2 packages (@modelcontextprotocol/core|server|client)',
		pattern: /@modelcontextprotocol\/sdk\b/,
	},
	{
		description:
			'documents SKIP_ENV_VALIDATION as a usable escape hatch (SEC-001/CONFIG-001 removed it outright — every env.ts throws if it is set)',
		pattern: /SKIP_ENV_VALIDATION\s*(=\s*true|===\s*['"]true['"])/,
	},
	{
		description:
			'documents the client_credentials grant as supported (SEC-001 removed anonymous machine-account provisioning through it)',
		pattern: /client_credentials/,
	},
	{
		description:
			"describes the deleted hand-written session-affinity transport (mcp-session-id header, 409 reconnect) as current behavior — PROTO-001 replaced it with the SDK's stateless dual-era handler",
		pattern: /mcp-session-id/i,
	},
	{
		description:
			'references the deleted WebStandardStreamableHTTPServerTransport class — PROTO-001 replaced the hand-written transport with createMcpHandler from @modelcontextprotocol/server',
		pattern: /WebStandardStreamableHTTPServerTransport/,
	},
	{
		description: 'placeholder domain "example.com" in checked-in documentation',
		pattern: /example\.com/i,
		onlyForExtensions: ['.md'],
	},
	{
		description: 'unfilled registry placeholder "YOUR_DOMAIN"',
		pattern: /YOUR_DOMAIN/,
		onlyForExtensions: ['.md'],
	},
	{ description: 'lorem ipsum placeholder text', pattern: /lorem ipsum/i },
] as const;

/**
 * Root-level documentation files this audit reads. Deliberately excludes
 * `PROGRESS.local.md`, `ROADMAP.local.md`, and anything under
 * `.roadmap-progress/` — see the file-level doc comment above.
 */
const EXCLUDED_ROOT_DOCUMENTS = new Set(['PROGRESS.local.md', 'ROADMAP.local.md']);

export function collectDocumentationTargets(rootDirectory: string): string[] {
	const targets: string[] = [];

	for (const entry of readdirSync(rootDirectory)) {
		if (!entry.endsWith('.md')) continue;
		if (EXCLUDED_ROOT_DOCUMENTS.has(entry)) continue;
		targets.push(join(rootDirectory, entry));
	}

	for (const claudeMdPath of [
		join(rootDirectory, 'CLAUDE.md'),
		join(rootDirectory, 'applications/web/CLAUDE.md'),
		join(rootDirectory, 'packages/database/CLAUDE.md'),
		join(rootDirectory, 'packages/mcp/CLAUDE.md'),
	]) {
		if (existsSync(claudeMdPath)) targets.push(claudeMdPath);
	}

	const skillsDirectory = join(rootDirectory, '.claude/skills');
	if (existsSync(skillsDirectory)) {
		for (const skillName of readdirSync(skillsDirectory)) {
			const skillFile = join(skillsDirectory, skillName, 'SKILL.md');
			if (existsSync(skillFile)) targets.push(skillFile);
		}
	}

	return targets;
}

export interface DocumentationViolation {
	readonly file: string;
	readonly description: string;
}

// Documenting that a removed API/architecture no longer exists ("no longer
// uses X", "not the v1 SDK", "there is no mcp-session-id header") is exactly
// the kind of accurate documentation this repository wants — the opposite
// of the stale-claim defect this audit hunts for. A match is only a real
// violation if it is NOT accompanied by an explicit negation within a short
// window before it in the same sentence.
const NEGATION_WINDOW_CHARACTERS = 40;
const NEGATION_WORDS = /\b(not|no|never|removed|deleted|replaced)\b/i;

// RFC 2606 reserves example.com for documentation; this codebase's own
// convention (see `packages/mcp/src/testing/context.ts`,
// `scripts/audit-production-content.ts`) treats the specific reserved test
// address as legitimate, never a real unfilled placeholder.
const RESERVED_TEST_EMAIL = 'test@example.com';

export function scanDocumentationContentsForViolations(
	filePath: string,
	fileContents: string,
): DocumentationViolation[] {
	const extension = filePath.slice(filePath.lastIndexOf('.'));
	const violations: DocumentationViolation[] = [];
	for (const forbidden of FORBIDDEN_DOCUMENTATION_PATTERNS) {
		if (forbidden.onlyForExtensions && !forbidden.onlyForExtensions.includes(extension)) continue;
		const globalPattern = new RegExp(
			forbidden.pattern.source,
			forbidden.pattern.flags.includes('g')
				? forbidden.pattern.flags
				: `${forbidden.pattern.flags}g`,
		);
		for (const match of fileContents.matchAll(globalPattern)) {
			const matchIndex = match.index ?? 0;
			const matchEnd = matchIndex + match[0].length;
			if (
				fileContents
					.slice(
						Math.max(0, matchIndex - RESERVED_TEST_EMAIL.length),
						matchEnd + RESERVED_TEST_EMAIL.length,
					)
					.includes(RESERVED_TEST_EMAIL)
			) {
				continue;
			}
			// Checked in both directions: "not the v1 SDK" negates before the
			// match, "client_credentials was removed" negates after it.
			const windowStart = Math.max(0, matchIndex - NEGATION_WINDOW_CHARACTERS);
			const windowEnd = Math.min(fileContents.length, matchEnd + NEGATION_WINDOW_CHARACTERS);
			const surroundingText = fileContents.slice(windowStart, windowEnd);
			if (NEGATION_WORDS.test(surroundingText)) continue;
			violations.push({ file: filePath, description: forbidden.description });
			break;
		}
	}
	return violations;
}

/**
 * Every backtick-quoted token that looks like an unambiguous,
 * repo-root-relative file path — starting with one of this monorepo's real
 * top-level directories, so a package-relative shorthand like `src/env.ts`
 * (a real, deliberate convention throughout this repository's docs — see
 * e.g. `packages/mcp/CLAUDE.md`, which discusses its OWN `src/` relative to
 * itself) is never mistaken for a dead reference. Skips anything containing
 * a placeholder marker (`<`, `HOST`, `{`, `...`, a glob `*`, or an
 * illustrative example name like `my-tool-name`) since those are
 * deliberately not real paths.
 */
const REPO_PATH_EXTENSIONS = [
	'.ts',
	'.svelte',
	'.md',
	'.json',
	'.yml',
	'.yaml',
	'.toml',
	'.css',
	'.sql',
];

const REPO_ROOT_DIRECTORY_PREFIXES = [
	'applications/',
	'packages/',
	'scripts/',
	'.github/',
	'.claude/',
];

export function extractReferencedFilePaths(fileContents: string): string[] {
	// Fenced blocks are removed before pairing inline backticks. A ``` fence is
	// three backticks, which throws the parity of a naive `` `...` `` scan off
	// for the entire rest of the file -- so in any document containing a fenced
	// block, every path mentioned after the first fence was silently invisible
	// to this gate. That was not a small blind spot: it covered ARCHITECTURE.md,
	// README.md, and CLAUDE.md completely, each extracting zero paths. Removing
	// fences first takes this audit from 15 recognized paths across the whole
	// repository to 101.
	//
	// Dropping the fenced content entirely is also correct on its own terms: a
	// path inside a code sample is illustrative and often deliberately does not
	// exist yet.
	const withoutFencedBlocks = fileContents.replace(/```[\s\S]*?```/g, '');
	const backtickTokens = withoutFencedBlocks.match(/`([^`]+)`/g) ?? [];
	const paths: string[] = [];
	for (const token of backtickTokens) {
		const inner = token.slice(1, -1);
		if (!REPO_ROOT_DIRECTORY_PREFIXES.some((prefix) => inner.startsWith(prefix))) continue;
		if (/[<>*{}]|HOST|\.\.\.|\s|my-|-name\b|app-name/.test(inner)) continue;
		if (!REPO_PATH_EXTENSIONS.some((extension) => inner.endsWith(extension))) continue;
		paths.push(inner);
	}
	return paths;
}

export function findMissingReferencedFiles(
	rootDirectory: string,
	paths: readonly string[],
): string[] {
	const missing: string[] = [];
	for (const path of paths) {
		const normalized = path.startsWith('./') ? path.slice(2) : path;
		if (!existsSync(join(rootDirectory, normalized))) {
			missing.push(path);
		}
	}
	return missing;
}

/** Every `bun run <script-name>` this documentation names. */
export function extractReferencedScriptNames(fileContents: string): string[] {
	const matches = fileContents.matchAll(/bun run ([a-zA-Z0-9:_-]+)/g);
	return [...matches].map((match) => match[1]!);
}

export function findMissingReferencedScripts(
	rootPackageJsonScripts: Readonly<Record<string, string>>,
	scriptNames: readonly string[],
): string[] {
	return scriptNames.filter((name) => !(name in rootPackageJsonScripts));
}

async function runAudit(): Promise<void> {
	const rootDirectory = process.cwd();
	const targets = collectDocumentationTargets(rootDirectory);

	if (targets.length === 0) {
		console.error(
			'[audit:documentation] FAIL: found no documentation files to scan. This is unexpected and likely means the script is not being run from the repository root.',
		);
		process.exit(1);
	}

	const rootPackageJson = JSON.parse(
		await Bun.file(join(rootDirectory, 'package.json')).text(),
	) as {
		scripts?: Record<string, string>;
	};
	const rootPackageJsonScripts = rootPackageJson.scripts ?? {};

	const contentViolations: DocumentationViolation[] = [];
	const missingPathViolations: { file: string; path: string }[] = [];
	const missingScriptViolations: { file: string; script: string }[] = [];

	for (const target of targets) {
		const fileContents = await Bun.file(target).text();
		const relativePath = relative(rootDirectory, target);

		contentViolations.push(...scanDocumentationContentsForViolations(relativePath, fileContents));

		const referencedPaths = extractReferencedFilePaths(fileContents);
		for (const missingPath of findMissingReferencedFiles(rootDirectory, referencedPaths)) {
			missingPathViolations.push({ file: relativePath, path: missingPath });
		}

		const referencedScripts = extractReferencedScriptNames(fileContents);
		for (const missingScript of findMissingReferencedScripts(
			rootPackageJsonScripts,
			referencedScripts,
		)) {
			missingScriptViolations.push({ file: relativePath, script: missingScript });
		}
	}

	const totalViolations =
		contentViolations.length + missingPathViolations.length + missingScriptViolations.length;

	if (totalViolations === 0) {
		console.log(
			`[audit:documentation] ok: scanned ${targets.length} documentation file(s), no stale claims, dead file references, or unknown scripts found.`,
		);
		return;
	}

	console.error('[audit:documentation] FAIL:');
	for (const violation of contentViolations) {
		console.error(`  - ${violation.file}: ${violation.description}`);
	}
	for (const violation of missingPathViolations) {
		console.error(
			`  - ${violation.file}: references a file that does not exist: ${violation.path}`,
		);
	}
	for (const violation of missingScriptViolations) {
		console.error(
			`  - ${violation.file}: references "bun run ${violation.script}", which is not a script in the root package.json`,
		);
	}
	process.exit(1);
}

if (import.meta.main) {
	await runAudit();
}
