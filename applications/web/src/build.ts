const styleBuildResult = Bun.spawnSync(
	[
		'bunx',
		'@tailwindcss/cli',
		'-i',
		'src/styles/application.css',
		'-o',
		'public/assets/application.css',
		'--minify',
	],
	{
		stdout: 'inherit',
		stderr: 'inherit',
		stdin: 'inherit',
	},
);

if (styleBuildResult.exitCode !== 0) {
	process.exit(styleBuildResult.exitCode);
}

const cleanResult = Bun.spawnSync(['rm', '-rf', 'dist'], {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin: 'inherit',
});
if (cleanResult.exitCode !== 0) {
	process.exit(cleanResult.exitCode);
}

const serverBuildResult = Bun.spawnSync(
	['bun', 'build', 'src/server.ts', '--target', 'bun', '--outdir', 'dist', '--sourcemap'],
	{
		stdout: 'inherit',
		stderr: 'inherit',
		stdin: 'inherit',
	},
);

if (serverBuildResult.exitCode !== 0) {
	process.exit(serverBuildResult.exitCode);
}

const copyPublicDirectoryResult = Bun.spawnSync(['cp', '-R', 'public', 'dist/public'], {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin: 'inherit',
});

if (copyPublicDirectoryResult.exitCode !== 0) {
	process.exit(copyPublicDirectoryResult.exitCode);
}
