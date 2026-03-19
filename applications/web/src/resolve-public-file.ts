const publicDirectoryUrls = [
	new URL('./public/', import.meta.url),
	new URL('../public/', import.meta.url),
];

export async function resolvePublicFile(
	relativePath: string,
): Promise<ReturnType<typeof Bun.file> | null> {
	for (const publicDirectoryUrl of publicDirectoryUrls) {
		const file = Bun.file(new URL(relativePath, publicDirectoryUrl));
		if (await file.exists()) return file;
	}
	return null;
}
