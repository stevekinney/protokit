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
	console.error(`${exitCode.processName} exited with code ${exitCode.value}`);
	process.exit(exitCode.value);
}

export {};
