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
		applyLocalProxyFetchEndpoint(undefined);

		const resolveFetchEndpoint = neonConfig.fetchEndpoint;
		expect(typeof resolveFetchEndpoint).toBe('function');
		if (typeof resolveFetchEndpoint !== 'function') {
			throw new Error('expected the default fetchEndpoint to be a function');
		}

		// The driver's real default rewrites the endpoint-id subdomain to
		// `api.` and always resolves to `https://.../sql` — asserting the
		// actual shape (not a guessed one) is what proves this module never
		// touched it.
		expect(resolveFetchEndpoint('ep-example-123456.us-east-2.aws.neon.tech', 443)).toBe(
			'https://api.us-east-2.aws.neon.tech/sql',
		);
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
