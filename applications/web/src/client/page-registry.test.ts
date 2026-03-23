import { describe, expect, it } from 'bun:test';
import { resolvePageComponent } from '@web/client/page-registry';

describe('resolvePageComponent', () => {
	it('resolves known page names to components', () => {
		const component = resolvePageComponent('home');
		expect(typeof component).toBe('function');
	});

	it('throws for unknown page names', () => {
		let thrown = false;
		try {
			resolvePageComponent('nonexistent');
		} catch (error) {
			thrown = true;
			expect((error as Error).message).toContain('Unknown page: "nonexistent"');
		}
		expect(thrown).toBe(true);
	});
});
