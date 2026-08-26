import { describe, expect, it } from 'bun:test';
import { mock } from 'bun:test';

/**
 * CONFIG-001 / S-20: "the server advertises... enterprise authorization...
 * beyond what is actually implemented." Enterprise authorization was a
 * mislabeled static client allowlist that never evaluated the configured
 * provider, so it was removed outright rather than merely un-advertised —
 * see `.roadmap-progress/CONFIG-001.md`. This asserts every piece of public
 * metadata this server exposes never mentions it again, so a future
 * reintroduction (e.g. copy-pasting the old health-routes.ts shape) is
 * caught immediately rather than silently reappearing.
 */

const mockEnvironment: Record<string, unknown> = {
	mcpEnableUiExtension: true,
	mcpTokenTtlSeconds: 3600,
	mcpRefreshTokenTtlSeconds: 2_592_000,
	baseUrl: 'https://app.example.com',
};

mock.module('@web/env', () => ({
	environment: mockEnvironment,
}));

mock.module('@template/database', () => ({
	database: {
		execute: async () => [{ '?column?': 1 }],
	},
	schema: {},
}));

mock.module('drizzle-orm', () => ({
	sql: Object.assign((strings: TemplateStringsArray) => strings.join(''), {
		raw: (value: string) => value,
	}),
	and: (...args: unknown[]) => args,
	eq: (column: unknown, value: unknown) => ({ column, value }),
	gt: (column: unknown, value: unknown) => ({ column, value }),
	isNull: (column: unknown) => ({ column }),
	inArray: (column: unknown, values: unknown) => ({ column, values }),
}));

mock.module('@web/lib/redis-client', () => ({
	isRedisConfigured: () => false,
	isRedisHealthy: async () => false,
	getRedisClient: async () => {
		throw new Error('Redis is not configured in this test.');
	},
	getRedisSubscriberClient: async () => {
		throw new Error('Redis is not configured in this test.');
	},
	disconnectRedisSubscriberClient: async () => {},
}));

mock.module('@web/lib/instance-identifier', () => ({
	instanceIdentifier: 'test-instance-id',
}));

mock.module('@web/lib/base-url', () => ({
	getBaseUrl: () => 'https://app.example.com',
}));

const { handleHealthGet } = await import('@web/routes/health-routes');
const { handleOauthAuthorizationMetadataGet } = await import('@web/routes/oauth-routes');

const testContext = {
	request: new Request('https://app.example.com/health'),
	requestUrl: new URL('https://app.example.com/health'),
	requestId: 'req-1',
	networkIdentity: '203.0.113.1',
	user: null,
	sessionToken: null,
};

describe('extension advertisement', () => {
	it('/health never mentions enterprise authorization', async () => {
		const response = handleHealthGet();
		const bodyText = await response.text();
		expect(bodyText.toLowerCase()).not.toContain('enterprise');
	});

	it('authorization server metadata never mentions enterprise authorization', async () => {
		const response = await handleOauthAuthorizationMetadataGet(testContext);
		const bodyText = await response.text();
		expect(bodyText.toLowerCase()).not.toContain('enterprise');
	});

	it('authorization server metadata only ever advertises grant types it fully implements', async () => {
		const response = await handleOauthAuthorizationMetadataGet(testContext);
		const body = (await response.json()) as { grant_types_supported: string[] };
		expect(body.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
	});
});
