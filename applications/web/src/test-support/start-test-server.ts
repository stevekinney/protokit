import { randomUUID } from 'node:crypto';

/**
 * TEST-001 (OPEN-9).
 *
 * Every integration test file in this application boots a real `Bun.serve`
 * with `port: 0` (an OS-assigned ephemeral port) and calls `server.stop(true)`
 * in `afterEach`. That pattern flaked exactly once in roughly ten concurrent
 * full-suite runs: `mcp-boundary-controls.integration.test.ts`'s
 * origin-rejection test received `404` instead of the `403` its own
 * dispatcher always returns for a rejected origin -- meaning the request
 * never reached the server instance this test started at all. It was not
 * reproducible in twelve targeted concurrent runs of that file alone, which
 * points at cross-PROCESS contention over the OS's ephemeral port range
 * (many concurrent `bun test` processes across this repository's ~13
 * integration files, each opening and closing several `Bun.serve` instances
 * per file) rather than anything wrong within one process.
 *
 * A real TCP listener cannot be double-bound -- the OS enforces that. What
 * CAN happen under heavy concurrent bind/close churn across independent
 * processes is a port being freed by one process's `stop(true)` and hastily
 * reissued to the "wrong" fetch: if a stale response or a slow connection
 * from a request meant for a just-closed listener resolves after a
 * DIFFERENT process's listener has already taken that same port number,
 * the caller can observe a response from a server it never intended to
 * talk to. This helper does not retry around that (retrying a
 * misdiagnosable failure is explicitly forbidden -- it would hide the
 * defect, not fix it). Instead it makes cross-server routing IMPOSSIBLE TO
 * MISREAD: every response this application ever sends is stamped with an
 * `X-Test-Server-Instance` header carrying this call's own random identity,
 * and `fetchFromTestServer` throws a named, unambiguous error the instant a
 * response's identity does not match the server that was supposed to
 * answer it -- converting a silent "404 where 403 was expected" (which
 * reads as a application-logic bug) into a loud "cross-server routing"
 * failure that names the real cause.
 */

export interface TestServerHandle {
	readonly port: number;
	readonly instanceId: string;
	stop(): void;
}

const TEST_SERVER_INSTANCE_HEADER = 'x-test-server-instance';

/**
 * Starts a `Bun.serve` instance on an OS-assigned port, wrapping `handler`
 * so every response it produces carries this instance's unique identity.
 * Wire the returned `stop()` into `afterEach` exactly as the existing
 * `server?.stop(true); server = null;` pattern already does.
 */
export function startTestServer(
	handler: (request: Request, server: Bun.Server) => Response | Promise<Response>,
): TestServerHandle {
	const instanceId = randomUUID();
	const server = Bun.serve({
		port: 0,
		async fetch(request, bunServer) {
			const response = await handler(request, bunServer);
			const stamped = new Response(response.body, response);
			stamped.headers.set(TEST_SERVER_INSTANCE_HEADER, instanceId);
			return stamped;
		},
	});
	return {
		port: server.port,
		instanceId,
		stop() {
			server.stop(true);
		},
	};
}

export class CrossServerRoutingError extends Error {
	constructor(expectedInstanceId: string, actualInstanceId: string | null, url: string) {
		super(
			`Response to ${url} carries server instance ${actualInstanceId ?? '(missing header)'}, ` +
				`not the ${expectedInstanceId} this test started. The request reached a different ` +
				`server than intended -- see the OPEN-9 note in start-test-server.ts.`,
		);
		this.name = 'CrossServerRoutingError';
	}
}

/**
 * `fetch`, but throws {@link CrossServerRoutingError} instead of returning a
 * response if that response did not come from `handle`'s own server
 * instance. Use this in place of a bare `fetch(...)` for every request an
 * integration test sends to a `startTestServer`-started listener.
 */
export async function fetchFromTestServer(
	handle: TestServerHandle,
	path: string,
	init?: RequestInit,
): Promise<Response> {
	const url = `http://127.0.0.1:${handle.port}${path}`;
	const response = await fetch(url, init);
	const actualInstanceId = response.headers.get(TEST_SERVER_INSTANCE_HEADER);
	if (actualInstanceId !== handle.instanceId) {
		throw new CrossServerRoutingError(handle.instanceId, actualInstanceId, url);
	}
	return response;
}
