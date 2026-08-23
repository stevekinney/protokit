import { afterEach, describe, expect, it } from 'bun:test';
import { neonConfig } from '@neondatabase/serverless';
import { applyLocalProxyFetchEndpoint } from './local-proxy';

describe('applyLocalProxyFetchEndpoint', () => {
	const originalFetchEndpoint = neonConfig.fetchEndpoint;

	afterEach(() => {
		neonConfig.fetchEndpoint = originalFetchEndpoint;
	});

	it('does not touch neonConfig.fetchEndpoint when no local proxy URL is configured', () => {
		// This is the production shape: DATABASE_LOCAL_PROXY_URL is unset, so
		// requests against a real Neon project must resolve exactly the way the
		// driver would resolve them with this module never having been imported.
		applyLocalProxyFetchEndpoint(undefined);

		expect(neonConfig.fetchEndpoint).toBe(originalFetchEndpoint);
	});

	it('leaves the driver default able to resolve a real Neon hostname when unconfigured', () => {
		// `neonConfig` is a module-level singleton shared by every test file in the
		// process, so this cannot assert the driver's pristine default value — any
		// file that ran earlier and set the proxy override would make that assertion
		// fail, which is exactly what happened in continuous integration while passing
		// locally on a different file ordering.
		//
		// What this test is actually for is the no-op property: calling with no
		// configured proxy must leave the endpoint resolving whatever it resolved
		// before. Capturing the behavior first and comparing after proves that
		// independently of what the global happens to hold.
		const hostname = 'ep-example-123456.us-east-2.aws.neon.tech';
		const resolveBefore = neonConfig.fetchEndpoint;
		const before =
			typeof resolveBefore === 'function' ? resolveBefore(hostname, 443) : resolveBefore;

		applyLocalProxyFetchEndpoint(undefined);

		const resolveAfter = neonConfig.fetchEndpoint;
		const after = typeof resolveAfter === 'function' ? resolveAfter(hostname, 443) : resolveAfter;

		expect(after).toBe(before);
	});

	it('overrides fetchEndpoint with the configured local proxy URL', () => {
		applyLocalProxyFetchEndpoint('http://db.localtest.me:4444/sql');

		expect(neonConfig.fetchEndpoint).toBe('http://db.localtest.me:4444/sql');
	});

	it('empty string is treated as unconfigured and leaves the default untouched', () => {
		applyLocalProxyFetchEndpoint('');

		expect(neonConfig.fetchEndpoint).toBe(originalFetchEndpoint);
	});
});
