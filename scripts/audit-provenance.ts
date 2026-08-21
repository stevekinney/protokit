import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { $ } from 'bun';

/**
 * SUPPLY-001 acceptance gate: a generated software bill of materials and
 * provenance statement that identify the exact source revision, lockfile,
 * builder, and image digest a given container image was produced from.
 *
 * Writes two files under `dist/provenance/`:
 *   - `sbom.cdx.json`     CycloneDX SBOM of the built image, via trivy.
 *   - `provenance.json`   git revision + working-tree cleanliness, the
 *                         lockfile's content hash, the builder and runner
 *                         base image digests this Dockerfile is pinned to,
 *                         and the digest of the image actually produced.
 */

const outputDirectory = 'dist/provenance';
const imageTag = process.env.RUNTIME_IMAGE_TAG ?? `protokit-provenance:${Date.now()}`;
const shouldBuild = process.env.RUNTIME_IMAGE_TAG === undefined;

if (shouldBuild) {
	console.log(`[audit:provenance] building ${imageTag} (--no-cache)`);
	await $`docker build --no-cache -t ${imageTag} .`;
} else {
	console.log(`[audit:provenance] using existing image ${imageTag}`);
}

await mkdir(outputDirectory, { recursive: true });

console.log('[audit:provenance] generating CycloneDX SBOM with trivy');
const sbomPath = `${outputDirectory}/sbom.cdx.json`;
await $`trivy image --format cyclonedx --output ${sbomPath} ${imageTag}`;

const gitRevision = (await $`git rev-parse HEAD`.text()).trim();
const gitStatusOutput = (await $`git status --porcelain`.text()).trim();
const workingTreeClean = gitStatusOutput.length === 0;

const lockfileBytes = await Bun.file('bun.lock').arrayBuffer();
const lockfileSha256 = createHash('sha256').update(Buffer.from(lockfileBytes)).digest('hex');

const dockerfileText = await Bun.file('Dockerfile').text();
const pinnedBaseImages = [...dockerfileText.matchAll(/FROM\s+(\S+@sha256:[0-9a-f]{64})/g)].map(
	(match) => match[1],
);

const producedImageDigest = (
	await $`docker inspect --format '{{index .RepoDigests 0}}' ${imageTag}`.nothrow().text()
).trim();
const producedImageId = (await $`docker inspect --format {{.Id}} ${imageTag}`.text()).trim();

const provenance = {
	generatedAt: new Date().toISOString(),
	source: {
		gitRevision,
		workingTreeClean,
	},
	lockfile: {
		path: 'bun.lock',
		sha256: lockfileSha256,
	},
	dockerfile: {
		path: 'Dockerfile',
		pinnedBaseImages,
	},
	image: {
		tag: imageTag,
		// RepoDigests is only populated for images pulled from or pushed to a
		// registry; a purely local build has an image ID but no registry
		// digest yet, which is expected and not itself a failure.
		repoDigest: producedImageDigest || null,
		imageId: producedImageId,
	},
	sbom: {
		format: 'CycloneDX',
		path: sbomPath,
	},
};

const provenancePath = `${outputDirectory}/provenance.json`;
await Bun.write(provenancePath, JSON.stringify(provenance, null, '\t') + '\n');

if (!workingTreeClean) {
	console.error(
		'[audit:provenance] WARNING: working tree is not clean — this provenance statement does ' +
			'not fully describe a reproducible build. Commit or stash before generating release provenance.',
	);
}

console.log(`[audit:provenance] wrote ${sbomPath}`);
console.log(`[audit:provenance] wrote ${provenancePath}`);

if (shouldBuild) {
	await $`docker rmi ${imageTag}`.nothrow().quiet();
}
