declare module 'bun:test' {
	type Expectation = {
		toBe: (expected: unknown) => void;
		toEqual: (expected: unknown) => void;
		toMatchObject: (expected: Record<string, unknown>) => void;
		toContain: (expected: unknown) => void;
		toBeGreaterThan: (expected: number) => void;
		toBeGreaterThanOrEqual: (expected: number) => void;
		toBeNull: () => void;
		not: {
			toBeNull: () => void;
		};
	};

	export const describe: (name: string, fn: () => void | Promise<void>) => void;
	export const it: (name: string, fn: () => void | Promise<void>) => void;
	export const expect: (value: unknown) => Expectation;
	export const beforeEach: (fn: () => void | Promise<void>) => void;
	export const afterEach: (fn: () => void | Promise<void>) => void;
	export const mock: {
		module: (moduleName: string, factory: () => unknown) => void;
	};
}

declare namespace Bun {
	type SpawnedProcess = {
		exited: Promise<number>;
		kill: () => void;
	};

	type SpawnSyncResult = {
		exitCode: number;
	};

	type FileReference = Blob & {
		exists: () => Promise<boolean>;
	};

	type RequestIp = {
		address: string;
	};

	type Server = {
		port: number;
		stop: (force?: boolean) => void;
		requestIP: (request: Request) => RequestIp | null;
	};

	type ServeOptions = {
		port?: number;
		fetch: (request: Request, server: Server) => Response | Promise<Response>;
	};
}

declare const Bun: {
	serve: (options: Bun.ServeOptions) => Bun.Server;
	spawn: (command: string[], options?: Record<string, unknown>) => Bun.SpawnedProcess;
	spawnSync: (command: string[], options?: Record<string, unknown>) => Bun.SpawnSyncResult;
	file: (path: string | URL) => Bun.FileReference;
};
