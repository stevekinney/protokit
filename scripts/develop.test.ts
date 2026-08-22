import { describe, expect, it } from 'bun:test';
import {
	buildDevelopmentServerEnvironment,
	exposedRoutes,
	formatExposedRoutesBanner,
	parseTunnelUrl,
	shouldEnableInspector,
	shouldEnableTunnel,
} from './develop.ts';

describe('shouldEnableTunnel', () => {
	it('is false without --tunnel', () => {
		expect(shouldEnableTunnel(['bun', 'scripts/develop.ts'])).toBe(false);
	});

	it('is false with unrelated flags', () => {
		expect(shouldEnableTunnel(['bun', 'scripts/develop.ts', '--inspector'])).toBe(false);
	});

	it('is true with --tunnel', () => {
		expect(shouldEnableTunnel(['bun', 'scripts/develop.ts', '--tunnel'])).toBe(true);
	});
});

describe('shouldEnableInspector', () => {
	it('is false without --inspector', () => {
		expect(shouldEnableInspector(['bun', 'scripts/develop.ts'])).toBe(false);
	});

	it('is true with --inspector', () => {
		expect(shouldEnableInspector(['bun', 'scripts/develop.ts', '--inspector'])).toBe(true);
	});
});

describe('parseTunnelUrl', () => {
	it('extracts a trycloudflare.com URL from arbitrary text', () => {
		const line =
			'INF |  https://random-words-here.trycloudflare.com                                |';
		expect(parseTunnelUrl(line)).toBe('https://random-words-here.trycloudflare.com');
	});

	it('returns null when no tunnel URL is present', () => {
		expect(parseTunnelUrl('INF Starting tunnel...')).toBeNull();
	});
});

describe('buildDevelopmentServerEnvironment', () => {
	// Regression for a bot-reported P1: the dev server was previously spawned before the tunnel
	// URL was known and never given BASE_URL afterward, so `getBaseUrl`
	// (`applications/web/src/lib/base-url.ts`, which deliberately ignores forwarded host/proto
	// headers) advertised `http://localhost:3000` in OAuth discovery documents, authorization
	// redirects, and the resource audience instead of the printed HTTPS tunnel origin — a hosted
	// connector following that metadata could never complete OAuth against the tunnel.
	it('sets BASE_URL to the tunnel URL when one is known', () => {
		const environment = buildDevelopmentServerEnvironment(
			true,
			{},
			'https://example.trycloudflare.com',
		);
		expect(environment.BASE_URL).toBe('https://example.trycloudflare.com');
	});

	it('never sets BASE_URL when no tunnel URL is known, even with the tunnel enabled', () => {
		const environment = buildDevelopmentServerEnvironment(true, {});
		expect(environment.BASE_URL).toBeUndefined();
	});

	it('never sets BASE_URL when the tunnel is disabled', () => {
		const environment = buildDevelopmentServerEnvironment(false, {});
		expect(environment.BASE_URL).toBeUndefined();
	});

	it('sets PROTOKIT_TUNNEL_ACTIVE to true only when the tunnel is enabled', () => {
		expect(buildDevelopmentServerEnvironment(true, {}).PROTOKIT_TUNNEL_ACTIVE).toBe('true');
		expect(buildDevelopmentServerEnvironment(false, {}).PROTOKIT_TUNNEL_ACTIVE).toBe('false');
	});

	it('preserves every other variable from the base environment', () => {
		const environment = buildDevelopmentServerEnvironment(false, { PATH: '/usr/bin', FOO: 'bar' });
		expect(environment.PATH).toBe('/usr/bin');
		expect(environment.FOO).toBe('bar');
	});
});

describe('exposedRoutes / formatExposedRoutesBanner', () => {
	it('never lists the development login route as exposed', () => {
		expect(exposedRoutes).not.toContain('/auth/dev/login');
	});

	it('includes the MCP endpoint and every OAuth discovery/token route', () => {
		expect(exposedRoutes).toContain('/mcp');
		expect(exposedRoutes).toContain('/oauth/authorize');
		expect(exposedRoutes).toContain('/oauth/token');
		expect(exposedRoutes).toContain('/.well-known/oauth-authorization-server');
	});

	it('renders every exposed route against the given tunnel URL', () => {
		const banner = formatExposedRoutesBanner('https://example.trycloudflare.com');
		for (const route of exposedRoutes) {
			expect(banner).toContain(`https://example.trycloudflare.com${route}`);
		}
	});

	it('warns that the development login bypass is disabled during the tunnel', () => {
		const banner = formatExposedRoutesBanner('https://example.trycloudflare.com');
		expect(banner).toContain('/auth/dev/login is disabled');
	});
});
