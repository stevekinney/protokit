declare module 'bun:test' {
	type AsyncExpectation = {
		toThrow: (expected?: unknown) => Promise<void>;
	};

	type Expectation = {
		toBe: (expected: unknown) => void;
		toEqual: (expected: unknown) => void;
		toMatchObject: (expected: Record<string, unknown>) => void;
		toContain: (expected: unknown) => void;
		toBeGreaterThan: (expected: number) => void;
		toBeGreaterThanOrEqual: (expected: number) => void;
		toBeNull: () => void;
		toBeUndefined: () => void;
		toBeDefined: () => void;
		toHaveProperty: (property: string, value?: unknown) => void;
		toHaveLength: (expected: number) => void;
		toThrow: (expected?: unknown) => void;
		rejects: AsyncExpectation;
		not: {
			toBe: (expected: unknown) => void;
			toBeNull: () => void;
			toHaveProperty: (property: string, value?: unknown) => void;
			toThrow: (expected?: unknown) => void;
			toContain: (expected: unknown) => void;
		};
	};

	export const describe: (name: string, fn: () => void | Promise<void>) => void;
	export const it: (name: string, fn: () => void | Promise<void>) => void;
	export const expect: (value: unknown) => Expectation;
	export const beforeEach: (fn: () => void | Promise<void>) => void;
	export const afterEach: (fn: () => void | Promise<void>) => void;
	export const beforeAll: (fn: () => void | Promise<void>) => void;
	export const afterAll: (fn: () => void | Promise<void>) => void;
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
		hostname?: string;
		static?: Record<string, Response>;
		/** Hard cap, in bytes, on any request body Bun will buffer before handing the request to `fetch`. Defense in depth below the route-specific limits in `request-limits.ts`. */
		maxRequestBodySize?: number;
		fetch: (request: Request, server: Server) => Response | Promise<Response>;
	};

	type BuildConfig = {
		entrypoints: string[];
		target?: 'bun' | 'node' | 'browser';
		outdir?: string;
		sourcemap?: 'external' | 'inline' | 'none';
	};

	type BuildOutput = {
		success: boolean;
		logs: Array<string>;
		outputs: Array<Blob>;
	};
}

declare const Bun: {
	serve: (options: Bun.ServeOptions) => Bun.Server;
	spawn: (command: string[], options?: Record<string, unknown>) => Bun.SpawnedProcess;
	spawnSync: (command: string[], options?: Record<string, unknown>) => Bun.SpawnSyncResult;
	file: (path: string | URL) => Bun.FileReference;
	build: (config: Bun.BuildConfig) => Promise<Bun.BuildOutput>;
};
