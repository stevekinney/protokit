import { describe, expect, it } from 'bun:test';
import { getContentSecurityPolicy } from '@web/lib/content-security-policy';

describe('getContentSecurityPolicy', () => {
	it('returns script-src self when scripts are allowed', () => {
		const csp = getContentSecurityPolicy({ allowScripts: true });
		expect(csp).toContain("script-src 'self'");
		expect(csp.includes("script-src 'none'")).toBe(false);
	});

	it('returns script-src none when scripts are not allowed', () => {
		const csp = getContentSecurityPolicy({ allowScripts: false });
		expect(csp).toContain("script-src 'none'");
	});

	it('always includes default-src self', () => {
		const csp = getContentSecurityPolicy({ allowScripts: true });
		expect(csp).toContain("default-src 'self'");
	});

	it('always includes frame-ancestors none', () => {
		const csp = getContentSecurityPolicy({ allowScripts: false });
		expect(csp).toContain("frame-ancestors 'none'");
	});
});
