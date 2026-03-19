import { logger } from '@template/mcp/logger';

const styleProcess = Bun.spawn(
	[
		'bunx',
		'@tailwindcss/cli',
		'-i',
		'src/styles/application.css',
		'-o',
		'public/assets/application.css',
		'--watch',
	],
	{
		stdout: 'inherit',
		stderr: 'inherit',
		stdin: 'inherit',
	},
);

const serverProcess = Bun.spawn(['bun', '--watch', 'src/server.ts'], {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin: 'inherit',
});

function shutdown() {
	styleProcess.kill();
	serverProcess.kill();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const exitCode = await Promise.race([
	styleProcess.exited.then((value) => ({ processName: 'styleProcess', value })),
	serverProcess.exited.then((value) => ({ processName: 'serverProcess', value })),
]);

shutdown();

if (exitCode.value !== 0) {
	logger.error(
		{ processName: exitCode.processName, exitCode: exitCode.value },
		'Development process exited with non-zero code',
	);
	process.exit(exitCode.value);
}

export {};
