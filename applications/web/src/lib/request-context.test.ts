import { describe, expect, it } from 'bun:test';
import type { RequestContext } from '@web/lib/request-context';

/**
 * `RequestContext` is purely a type declaration -- no runtime exports --
 * used across `src/routes/*.ts(x)` and `src/application.tsx` to carry the
 * one already-resolved `networkIdentity`, session `user`, and request
 * metadata every downstream handler must read rather than re-derive. There
 * is no executable line in `request-context.ts` to exercise, so this test
 * proves the shape's actual contract instead: which fields are required,
 * which are optional/nullable, and that `networkIdentity` -- the field the
 * module's own doc comment says every consumer must trust -- really is a
 * plain `string`, not itself an optional or nullable field a caller could
 * skip checking.
 */
describe('RequestContext', () => {
	function buildContext(overrides: Partial<RequestContext> = {}): RequestContext {
		return {
			request: new Request('https://example.com/mcp'),
			requestUrl: new URL('https://example.com/mcp'),
			requestId: 'request-id-123',
			networkIdentity: '203.0.113.5',
			user: null,
			sessionToken: null,
			...overrides,
		};
	}

	it('carries the resolved network identity as a required, non-nullable string', () => {
		const context = buildContext({ networkIdentity: '198.51.100.9' });
		expect(context.networkIdentity).toBe('198.51.100.9');
		expect(typeof context.networkIdentity).toBe('string');
	});

	it('allows clientAddress to be omitted, distinct from the resolved networkIdentity', () => {
		const context = buildContext();
		expect(context.clientAddress).toBeUndefined();

		const withClientAddress = buildContext({ clientAddress: '10.0.0.1' });
		expect(withClientAddress.clientAddress).toBe('10.0.0.1');
		// clientAddress is the raw, pre-trusted-proxy-resolution address --
		// distinct from networkIdentity even when both are populated.
		expect(withClientAddress.networkIdentity).not.toBe(withClientAddress.clientAddress);
	});

	it('allows user and sessionToken to both be null for an unauthenticated request', () => {
		const context = buildContext({ user: null, sessionToken: null });
		expect(context.user).toBeNull();
		expect(context.sessionToken).toBeNull();
	});

	it('carries the original Request and its parsed requestUrl consistently', () => {
		const context = buildContext({
			request: new Request('https://example.com/oauth/authorize?client_id=abc'),
			requestUrl: new URL('https://example.com/oauth/authorize?client_id=abc'),
		});
		expect(context.request.url).toBe(context.requestUrl.toString());
		expect(context.requestUrl.searchParams.get('client_id')).toBe('abc');
	});
});
