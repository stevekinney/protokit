import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * OBS-001 / S-14: a static complement to `packages/mcp/src/redaction.test.ts`.
 * That test proves pino's `redact.paths` and the value-based
 * `hooks.streamWrite` scrub actually redact a real canary corpus.
 * Structured key-path redaction cannot help with a secret baked directly
 * into a log MESSAGE string via template-literal interpolation — that
 * shape has no key for pino to match against at all. This scan finds any
 * `logger`/`requestLogger`/`.child(...)`-derived call whose message
 * argument interpolates a variable whose name looks like a credential,
 * across every source file this workspace ships. Run via
 * `bun run audit:logs`.
 */

const SOURCE_ROOTS = ['applications/web/src', 'packages/mcp/src', 'packages/database/src'];

const TEXT_FILE_EXTENSIONS = new Set(['.ts', '.tsx']);

// Identifier fragments that indicate a variable is credential-shaped.
// Deliberately conservative (word-bounded, case-insensitive) to keep the
// false-positive rate low enough for this to run as a real release gate —
// `userId`, `clientId`, `requestId`, `sessionToken` (a non-secret opaque
// lookup key, not the cookie value itself) are not flagged.
const SENSITIVE_IDENTIFIER_PATTERN =
	/\b(accessToken|refreshToken|idToken|clientSecret|codeVerifier|codeChallenge|authorizationCode|bearerToken|password|databaseUrl|redisUrl)\b/;

export interface LogMessageViolation {
	readonly file: string;
	readonly line: number;
	readonly snippet: string;
}

/**
 * `logger`/`requestLogger`/a `.child(...)` result and any of the codebase's
 * own child-logger local names, followed by `.info(`/`.warn(`/`.error(`/
 * `.debug(`/`.trace(`/`.fatal(` whose FIRST argument is a template literal
 * (backtick string). Only the message-argument shape is checked — a
 * structured object argument (`logger.info({ ... }, 'message')`) is
 * pino's job via `redact.paths`, covered by `redaction.test.ts` instead.
 */
const LOG_CALL_WITH_TEMPLATE_MESSAGE =
	/\b(?:logger|requestLogger|childLogger)\.(?:info|warn|error|debug|trace|fatal)\(\s*`([^`]*)`/g;

export function scanFileForLogMessageViolations(
	filePath: string,
	fileContents: string,
): LogMessageViolation[] {
	const violations: LogMessageViolation[] = [];
	const lines = fileContents.split('\n');
	for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
		const line = lines[lineIndex]!;
		LOG_CALL_WITH_TEMPLATE_MESSAGE.lastIndex = 0;
		const match = LOG_CALL_WITH_TEMPLATE_MESSAGE.exec(line);
		if (!match) continue;
		const templateBody = match[1] ?? '';
		if (SENSITIVE_IDENTIFIER_PATTERN.test(templateBody)) {
			violations.push({ file: filePath, line: lineIndex + 1, snippet: line.trim() });
		}
	}
	return violations;
}

export function collectScanTargets(rootDirectory: string): string[] {
	const targets: string[] = [];
	for (const sourceRoot of SOURCE_ROOTS) {
		const sourceRootPath = join(rootDirectory, sourceRoot);
		if (!existsSync(sourceRootPath)) continue;
		for (const filePath of listFilesRecursively(sourceRootPath)) {
			if (/\.test\.tsx?$/.test(filePath)) continue;
			const extension = filePath.slice(filePath.lastIndexOf('.'));
			if (!TEXT_FILE_EXTENSIONS.has(extension)) continue;
			targets.push(filePath);
		}
	}
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

async function runAudit(): Promise<void> {
	const rootDirectory = process.cwd();
	const targets = collectScanTargets(rootDirectory);

	if (targets.length === 0) {
		console.error(
			'[audit:logs] FAIL: found no source files under the expected workspace directories. This is unexpected and likely means the script is not being run from the repository root.',
		);
		process.exit(1);
	}

	let violations: LogMessageViolation[] = [];
	for (const target of targets) {
		const fileContents = await Bun.file(target).text();
		violations = violations.concat(scanFileForLogMessageViolations(target, fileContents));
	}

	if (violations.length === 0) {
		console.log(
			`[audit:logs] ok: scanned ${targets.length} source file(s), no credential-shaped identifier interpolated into a log message string`,
		);
		return;
	}

	console.error('[audit:logs] FAIL:');
	for (const violation of violations) {
		console.error(`  ${violation.file}:${violation.line}: ${violation.snippet}`);
	}
	process.exit(1);
}

if (import.meta.main) {
	await runAudit();
}
