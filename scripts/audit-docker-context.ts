import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

/**
 * SECRETS-001 (S-12): proves — against the real `docker build` context, not by re-parsing
 * `.dockerignore` — that no `.env*` file (besides the sanitized `.env.example`), certificate,
 * key, or provider-credential directory ever reaches a Docker build context, at any depth.
 * Re-parsing the ignore file would only prove the file looks right; a bare (non-double-star
 * prefixed) dockerignore pattern matches only at the context root, not at any depth, which is
 * exactly the gap this audit exists to catch (confirmed empirically: a scratch context with a
 * nested "sub/.env.local" leaked past the previous root-only .dockerignore patterns).
 */

export const LEAK_PATTERN_DESCRIPTION =
	'a .env* file other than .env.example, or a *.pem/*.key/*.p12/*.pfx/*.crt file, or a .aws/ or .ssh/ directory entry';

// Matches at any depth: a path segment that is exactly ".env" or starts with ".env.", or a path
// ending in one of the credential/certificate extensions, or a path segment named ".aws" or
// ".ssh" — but never `.env.example` itself, which is the deliberate, sanitized exception.
const LEAK_PATTERN =
	/(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx|crt)$|(^|\/)\.aws(\/|$)|(^|\/)\.ssh(\/|$)/;
const ALLOWED_EXCEPTION = /(^|\/)\.env\.example$/;

export function findLeakedSecretPaths(contextFiles: readonly string[]): string[] {
	return contextFiles.filter((file) => LEAK_PATTERN.test(file) && !ALLOWED_EXCEPTION.test(file));
}

export function parseContextFileListing(rawListing: string): string[] {
	return rawListing
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => line.replace(/^\/ctx\//, ''));
}

async function runAudit(): Promise<void> {
	const rootDirectory = join(import.meta.dirname, '..');
	const runId = randomBytes(4).toString('hex');
	const imageTag = `protokit-docker-context-audit:${runId}`;

	const scratchDirectory = mkdtempSync(join(tmpdir(), 'protokit-docker-context-audit-'));
	const scratchDockerfile = join(scratchDirectory, 'Dockerfile.context-audit');

	writeFileSync(
		scratchDockerfile,
		[
			'FROM busybox',
			'COPY . /ctx',
			'RUN find /ctx -type f | sort > /context-file-list.txt',
			'',
		].join('\n'),
	);

	let failed = false;

	try {
		console.log('[audit:docker-context] building a throwaway image from the real build context');
		await $`docker build --no-cache -f ${scratchDockerfile} -t ${imageTag} ${rootDirectory}`.quiet();

		const listing = (
			await $`docker run --rm ${imageTag} cat /context-file-list.txt`.quiet()
		).stdout.toString();

		const contextFiles = parseContextFileListing(listing);
		const leaks = findLeakedSecretPaths(contextFiles);

		if (leaks.length > 0) {
			failed = true;
			console.error(
				`[audit:docker-context] FAIL: ${leaks.length} file(s) matching ${LEAK_PATTERN_DESCRIPTION} reached the build context:`,
			);
			for (const leak of leaks) console.error(`  ${leak}`);
		} else {
			console.log(
				`[audit:docker-context] ok: ${contextFiles.length} files in the build context, none match ${LEAK_PATTERN_DESCRIPTION}`,
			);
		}
	} finally {
		await $`docker rmi -f ${imageTag}`.quiet().nothrow();
		rmSync(scratchDirectory, { recursive: true, force: true });
	}

	if (failed) process.exit(1);
}

if (import.meta.main) {
	await runAudit();
}
