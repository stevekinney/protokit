import { describe, it, expect } from 'bun:test';
import { areResourceSubscriptionsAuthorized, createMcpServer } from './server';

describe('createMcpServer', () => {
	it('returns a defined server instance', () => {
		const server = createMcpServer({
			userId: 'test-user-id',
			user: {
				id: 'test-user-id',
				email: 'test@example.com',
				name: 'Test User',
				image: null,
				role: 'user',
			},
			enableUiExtension: true,
			enableConformanceMode: false,
			scopes: ['profile:read'],
		});
		expect(server).toBeDefined();
	});
});

/**
 * Regression coverage for the round-seventeen review finding: a
 * `subscriptions/listen` request naming `resourceSubscriptions: ['user://profile']`
 * (which requires `profile:read`) must be denied for a caller holding only
 * `prompts:read` — the exact scenario the report describes (a client that
 * later receives a `resource_updated` event for a resource it was never
 * granted read access to).
 */
describe('areResourceSubscriptionsAuthorized', () => {
	it('authorizes a URI whose resource requires a scope the caller holds', () => {
		expect(areResourceSubscriptionsAuthorized(['user://profile'], ['profile:read'])).toBe(true);
	});

	it('denies a URI whose resource requires a scope the caller lacks (the reported bypass)', () => {
		expect(areResourceSubscriptionsAuthorized(['user://profile'], ['prompts:read'])).toBe(false);
	});

	it('denies when the caller holds no scopes at all', () => {
		expect(areResourceSubscriptionsAuthorized(['user://profile'], [])).toBe(false);
	});

	it('fails closed for a URI that names no known resource, without disclosing that distinctly', () => {
		expect(
			areResourceSubscriptionsAuthorized(
				['user://does-not-exist'],
				['profile:read', 'prompts:read'],
			),
		).toBe(false);
	});

	it('denies the whole request when only one of several requested URIs is under-scoped', () => {
		expect(
			areResourceSubscriptionsAuthorized(
				['user://profile', 'user://does-not-exist'],
				['profile:read'],
			),
		).toBe(false);
	});

	it('authorizes an empty subscription list vacuously', () => {
		expect(areResourceSubscriptionsAuthorized([], [])).toBe(true);
	});
});
