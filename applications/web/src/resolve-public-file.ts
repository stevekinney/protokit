import { realpath as realpathAsync } from 'node:fs/promises';
import { sep as pathSeparator, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * S-19: the previous implementation resolved `relativePath` against a
 * `public/` base URL and trusted the result — `new URL('../../../etc/passwd',
 * base)` (and its backslash and leading-slash equivalents) resolves *above*
 * the base with no error, because `URL` resolution has no concept of a
 * containment boundary. This rewrite checks the resolved filesystem path is
 * actually inside one of the allowed roots — via `path.resolve` for
 * `../`-style traversal, and again via `fs.realpath` so a symlink inside the
 * public directory cannot point back out.
 */
const publicDirectoryRoots = [
	fileURLToPath(new URL('./public/', import.meta.url)),
	fileURLToPath(new URL('../public/', import.meta.url)),
].map((root) => resolvePath(root));

/** `path.sep`-boundary containment: `candidate` must equal `root` or start with `root + sep`, not merely share `root` as a string prefix (which would wrongly admit a sibling like `public-secret/`). */
function isWithinRoot(root: string, candidate: string): boolean {
	return candidate === root || candidate.startsWith(root + pathSeparator);
}

async function realpathOrSelf(candidatePath: string): Promise<string> {
	try {
		return await realpathAsync(candidatePath);
	} catch {
		return candidatePath;
	}
}

export async function resolvePublicFile(
	relativePath: string,
): Promise<ReturnType<typeof Bun.file> | null> {
	// Backslashes are meaningless in a public asset path but are treated as
	// path separators by some resolvers (and by Windows filesystems); NUL
	// bytes truncate C-string filesystem calls. Neither has a legitimate use
	// here, so reject both outright rather than trying to sanitize them.
	if (relativePath.includes('\\') || relativePath.includes('\0')) {
		return null;
	}

	for (const root of publicDirectoryRoots) {
		const resolvedCandidate = resolvePath(root, relativePath);
		if (!isWithinRoot(root, resolvedCandidate)) {
			continue;
		}

		const file = Bun.file(resolvedCandidate);
		if (!(await file.exists())) {
			continue;
		}

		// The lexical resolution above blocks `../`-style traversal, but not a
		// symlink that lives inside the root and points outside it. Re-check
		// containment against the realpathed root once the candidate is known
		// to exist.
		const realRoot = await realpathOrSelf(root);
		const realCandidate = await realpathOrSelf(resolvedCandidate);
		if (!isWithinRoot(realRoot, realCandidate)) {
			continue;
		}

		return file;
	}

	return null;
}
