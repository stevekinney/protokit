import { resolve as resolvePath, dirname, basename } from 'node:path';
import { $ } from 'bun';

/**
 * One way to run trivy, shared by every script that needs it.
 *
 * Continuous-integration runners have no `trivy` on PATH — the security
 * workflow runs it as a pinned container image instead. Scripts that shelled
 * out to a bare `trivy` therefore did not scan anything there, and each failed
 * in its own misleading way: `audit-runtime-image.ts` reported the missing
 * binary as "an unexpired HIGH/CRITICAL vulnerability", and
 * `audit-provenance.ts` died with a raw ShellError. Two scripts, the same
 * defect, found one CI run apart — which is the argument for a single helper
 * rather than a third copy of the fallback.
 *
 * The digest is pinned to the same value `.github/workflows/security-scan.yml`
 * uses for its own trivy steps. Keep them in step: `bun run audit:workflows`
 * checks that every action reference stays SHA-pinned, and this image should be
 * held to the same standard.
 */
export const TRIVY_IMAGE =
	'aquasec/trivy@sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c';

let cachedHasLocalTrivy: boolean | undefined;

async function hasLocalTrivy(): Promise<boolean> {
	// `TRIVY_FORCE_DOCKER=1` forces the container path even where a local binary
	// exists. Without it, a developer with trivy installed never exercises the
	// branch continuous integration actually takes — which is precisely how the
	// relative-`-v` bug below reached CI twice while passing locally every time.
	if (process.env.TRIVY_FORCE_DOCKER === '1') return false;

	cachedHasLocalTrivy ??= (await $`command -v trivy`.nothrow().quiet()).exitCode === 0;
	return cachedHasLocalTrivy;
}

/**
 * Runs trivy with the given arguments, preferring a local binary and otherwise
 * using the pinned image.
 *
 * `outputPath`, when given, names a host file trivy writes to. The container
 * cannot see the host filesystem, so that directory is mounted and the path is
 * rewritten to the container's view of it — without which `--output` silently
 * writes inside the container and the caller finds nothing on disk.
 *
 * Never throws on a nonzero exit: callers must distinguish trivy's documented
 * exit code 1 ("findings present") from any other code ("trivy could not run"),
 * and conflating those is exactly what made the original failure unreadable.
 */
export async function runTrivy(
	trivyArguments: string[],
	options: { outputPath?: string } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
	const useLocal = await hasLocalTrivy();

	if (useLocal) {
		const result = await $`trivy ${trivyArguments}`.nothrow().quiet();
		return {
			exitCode: result.exitCode,
			stdout: result.stdout.toString(),
			stderr: result.stderr.toString(),
		};
	}

	const dockerArguments = [
		'run',
		'--rm',
		// Trivy inspects images through the daemon rather than pulling them, so
		// a locally built tag is only visible with the socket mounted.
		'-v',
		'/var/run/docker.sock:/var/run/docker.sock',
	];

	let effectiveArguments = trivyArguments;

	if (options.outputPath) {
		// Docker refuses a relative `-v` source: it reads anything without a
		// leading slash as a named volume, so `dist/provenance` failed with
		// "includes invalid characters for a local volume name". Resolve against
		// the working directory before mounting.
		const absoluteOutputPath = resolvePath(options.outputPath);
		dockerArguments.push('-v', `${dirname(absoluteOutputPath)}:/trivy-output`);
		effectiveArguments = trivyArguments.map((argument) =>
			argument === options.outputPath ? `/trivy-output/${basename(absoluteOutputPath)}` : argument,
		);
	}

	const result = await $`docker ${dockerArguments} ${TRIVY_IMAGE} ${effectiveArguments}`
		.nothrow()
		.quiet();

	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}
