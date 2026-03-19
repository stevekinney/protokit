import { cpSync, rmSync } from 'node:fs';

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

rmSync('dist', { recursive: true, force: true });

const serverBuildOutput = await Bun.build({
	entrypoints: ['src/server.ts'],
	target: 'bun',
	outdir: 'dist',
	sourcemap: 'external',
});

if (!serverBuildOutput.success) {
	for (const message of serverBuildOutput.logs) {
		console.error(message);
	}
	process.exit(1);
}

cpSync('public', 'dist/public', { recursive: true });

export {};
