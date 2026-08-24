import { describe, expect, it } from 'bun:test';
import {
	CrossServerRoutingError,
	fetchFromTestServer,
	startTestServer,
	TEST_SERVER_INSTANCE_HEADER,
} from '@web/test-support/start-test-server';

/**
 * OPEN-9: this file proves `startTestServer`/`fetchFromTestServer`'s own
 * cross-server-identity check directly, rather than only incidentally
 * through the ~13 integration files that use them. Real `Bun.serve`
 * listeners, no mocking -- consistent with this codebase's own house style
 * for infrastructure like this.
 */
describe('startTestServer / fetchFromTestServer', () => {
	it('stamps every response with the instance header and returns it through fetchFromTestServer', async () => {
		const handle = startTestServer(async () => new Response('ok', { status: 200 }));
		try {
			const response = await fetchFromTestServer(handle, '/anything');
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('ok');
			expect(response.headers.get(TEST_SERVER_INSTANCE_HEADER)).toBe(handle.instanceId);
		} finally {
			handle.stop();
		}
	});

	it('throws CrossServerRoutingError when the response identity does not match the handle used to request it', async () => {
		const handleA = startTestServer(async () => new Response('from A'));
		const handleB = startTestServer(async () => new Response('from B'));
		try {
			// Deliberately construct a "handle" pointing at B's port but
			// carrying A's expected instance id -- simulates the exact
			// cross-process routing failure this module exists to convert
			// from a silent misread into a loud, named error.
			const mismatchedHandle = { ...handleB, instanceId: handleA.instanceId };
			try {
				await fetchFromTestServer(mismatchedHandle, '/');
				throw new Error('expected fetchFromTestServer to throw');
			} catch (error) {
				expect(error instanceof CrossServerRoutingError).toBe(true);
			}
		} finally {
			handleA.stop();
			handleB.stop();
		}
	});

	it('CrossServerRoutingError names the expected instance, actual instance, and URL', async () => {
		const handle = startTestServer(async () => new Response('ok'));
		try {
			const wrongInstanceHandle = { ...handle, instanceId: 'not-the-real-instance-id' };
			try {
				await fetchFromTestServer(wrongInstanceHandle, '/some-path');
				throw new Error('expected fetchFromTestServer to throw');
			} catch (error) {
				expect(error instanceof CrossServerRoutingError).toBe(true);
				expect((error as Error).message).toContain('not-the-real-instance-id');
				expect((error as Error).message).toContain(handle.instanceId);
				expect((error as Error).message).toContain('/some-path');
			}
		} finally {
			handle.stop();
		}
	});

	it('CrossServerRoutingError reports "(missing header)" when the response carries no instance header at all', async () => {
		// A response from something other than `startTestServer` (or a
		// misconfigured handler) never sets `TEST_SERVER_INSTANCE_HEADER` --
		// exercises the `actualInstanceId ?? '(missing header)'` fallback.
		const handle = startTestServer(async () => new Response('ok'));
		try {
			// Bypass the stamping wrapper entirely by pointing at a bare,
			// unstamped listener on the same port range shape `fetchFromTestServer`
			// expects, via a handle whose port serves an unstamped response.
			const rawServer = Bun.serve({ port: 0, fetch: () => new Response('unstamped') });
			try {
				const rawHandle = { port: rawServer.port, instanceId: 'expected-instance-id', stop() {} };
				await fetchFromTestServer(rawHandle, '/anything');
				throw new Error('expected fetchFromTestServer to throw');
			} catch (error) {
				expect(error instanceof CrossServerRoutingError).toBe(true);
				expect((error as Error).message).toContain('(missing header)');
			} finally {
				rawServer.stop(true);
			}
		} finally {
			handle.stop();
		}
	});
});
