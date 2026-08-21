import { randomBytes } from 'node:crypto';
import { $ } from 'bun';

/**
 * SUPPLY-001 acceptance gate: builds the exact production image this
 * repository ships and asserts, against the real built artifact rather than
 * source inspection, that it is a minimal, non-root, vulnerability-clean
 * runtime.
 *
 * Checked, in order (any failure exits non-zero):
 *   1. `trivy image` reports zero HIGH/CRITICAL vulnerability findings
 *      (OS packages and application dependencies alike) and no secret
 *      findings baked into the produced image's layers.
 *   2. `Config.User` is a numeric, non-zero UID (never root, never a name
 *      that resolves through a passwd file we don't control).
 *   3. The image has no usable shell — `/bin/sh` cannot be exec'd as the
 *      entrypoint. Distroless bases have no shell at all; this fails loudly
 *      if a future base swap reintroduces one.
 *   4. `Healthcheck` is declared on the image config.
 *   5. Every file under `/app` is owned by root (uid 0) while the image
 *      runs as a non-root user, so the runtime process cannot write to its
 *      own application files even without `--read-only`.
 *   6. No development-only tooling (eslint, typescript, drizzle-kit) is
 *      present under `node_modules/.bin` — proof the `--production` prune
 *      in the Dockerfile's `runtime-deps` stage actually took effect.
 */

const runId = randomBytes(4).toString('hex');
const imageTag = process.env.RUNTIME_IMAGE_TAG ?? `protokit-runtime-audit:${runId}`;
const shouldBuild = process.env.RUNTIME_IMAGE_TAG === undefined;

const failures: string[] = [];

function fail(message: string): void {
	failures.push(message);
	console.error(`[audit:runtime-image] FAIL: ${message}`);
}

function pass(message: string): void {
	console.log(`[audit:runtime-image] ok: ${message}`);
}

if (shouldBuild) {
	console.log(`[audit:runtime-image] building ${imageTag} (--no-cache)`);
	await $`docker build --no-cache -t ${imageTag} .`;
} else {
	console.log(`[audit:runtime-image] using existing image ${imageTag}`);
}

// 1. Vulnerability scan of the built artifact itself, not just the lockfile.
console.log('[audit:runtime-image] scanning image with trivy');
const trivyResult =
	await $`trivy image --exit-code 1 --severity HIGH,CRITICAL --scanners vuln,secret ${imageTag}`
		.nothrow()
		.quiet();
if (trivyResult.exitCode !== 0) {
	fail('trivy image reported an unexpired HIGH/CRITICAL vulnerability or a secret finding');
	process.stderr.write(trivyResult.stdout.toString());
	process.stderr.write(trivyResult.stderr.toString());
} else {
	pass('trivy image: zero HIGH/CRITICAL findings');
}

// 2. Numeric, non-root user.
const userField = (await $`docker inspect --format {{.Config.User}} ${imageTag}`.text()).trim();
const numericNonRootUser = /^[1-9][0-9]*(:[1-9][0-9]*)?$/;
if (!numericNonRootUser.test(userField)) {
	fail(`Config.User is "${userField}", expected a numeric non-root UID (optionally ":GID")`);
} else {
	pass(`runs as numeric non-root user ${userField}`);
}

// 3. No usable shell.
const shellAttempt = await $`docker run --rm --entrypoint /bin/sh ${imageTag} -c "echo reachable"`
	.nothrow()
	.quiet();
if (shellAttempt.exitCode === 0) {
	fail('/bin/sh executed successfully inside the image — a shell is present');
} else {
	pass("no usable shell (/bin/sh cannot be exec'd)");
}

// 4. Healthcheck declared.
const healthcheckField = (
	await $`docker inspect --format '{{json .Config.Healthcheck}}' ${imageTag}`.text()
).trim();
if (healthcheckField === 'null' || healthcheckField === '') {
	fail('image declares no HEALTHCHECK');
} else {
	pass('HEALTHCHECK is declared');
}

// 5. Application files are root-owned (unwritable by the runtime user).
const containerId = (await $`docker create ${imageTag}`.text()).trim();
try {
	const tarListing = await $`docker export ${containerId} | tar tvf - --wildcards 'app/*'`
		.nothrow()
		.text();
	const nonRootOwnedLines = tarListing
		.split('\n')
		.filter((line) => line.trim().length > 0)
		.filter((line) => {
			// bsdtar/gnu tar verbose listing: `<perms> <owner>/<group> <size> ...`
			const ownerField = line.split(/\s+/)[1];
			return ownerField !== undefined && !ownerField.startsWith('0/');
		});
	if (nonRootOwnedLines.length > 0) {
		fail(
			`${nonRootOwnedLines.length} file(s) under /app are not root-owned (writable by a non-root user): ` +
				nonRootOwnedLines.slice(0, 5).join(' | '),
		);
	} else {
		pass('every file under /app is root-owned (unwritable by the runtime user)');
	}
} finally {
	await $`docker rm -f ${containerId}`.quiet();
}

// 6. No development tooling shipped.
const devToolingBinaries = ['eslint', 'tsc', 'drizzle-kit', 'playwright'];
const devToolingCheckScript = `
const fs = require('fs');
const found = ${JSON.stringify(devToolingBinaries)}.filter((name) =>
  fs.existsSync('/app/node_modules/.bin/' + name),
);
process.exit(found.length > 0 ? 1 : 0);
`;
const devToolingResult =
	await $`docker run --rm --entrypoint /usr/local/bin/bun ${imageTag} -e ${devToolingCheckScript}`
		.nothrow()
		.quiet();
if (devToolingResult.exitCode !== 0) {
	fail('development tooling found under node_modules/.bin in the runtime image');
} else {
	pass('no development tooling under node_modules/.bin');
}

if (shouldBuild) {
	await $`docker rmi ${imageTag}`.nothrow().quiet();
}

if (failures.length > 0) {
	console.error(`\n[audit:runtime-image] ${failures.length} check(s) failed.`);
	process.exit(1);
}

console.log('\n[audit:runtime-image] all checks passed.');
