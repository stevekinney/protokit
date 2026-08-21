import { describe, expect, it } from 'bun:test';
import {
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
